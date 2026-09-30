import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import {
  adicionarDiasUteis,
  formatarDataSimples,
  hojeISO,
  preencherTemplate,
  statusAutomaticoPedido,
  type StatusArte,
  type StatusPedido,
} from '@onprint/shared'
import { registrarAuditoria } from '../../core/auditoria'

export interface MudancaPedido {
  pedidoId: string
  numero: string
  antes: StatusPedido
  depois: StatusPedido
  vendedorId: string | null
}

/**
 * Recalcula o status do pedido pelas artes e OPs (regra em @onprint/shared/status-pedido).
 * Chamar dentro da mesma transação que alterou a arte ou a OP.
 * Quando o pedido fica "pronto", gera a notificação interna com o texto do template "pedido pronto".
 */
export async function sincronizarStatusPedido(
  tx: Prisma.TransactionClient,
  pedidoId: string,
  usuarioId: string | null,
): Promise<MudancaPedido | null> {
  const pedido = await tx.pedido.findUnique({
    where: { id: pedidoId },
    include: {
      cliente: { select: { nome: true } },
      itens: { select: { artes: { orderBy: { versao: 'desc' }, take: 1, select: { status: true } } } },
      ordensProducao: { where: { cancelada: false }, select: { etapaAtual: true } },
    },
  })
  if (!pedido) return null

  const novo = statusAutomaticoPedido({
    status: pedido.status,
    artes: pedido.itens.map((i) => (i.artes[0]?.status ?? 'aguardando_arquivo') as StatusArte),
    ops: pedido.ordensProducao.map((o) => o.etapaAtual),
  })
  if (novo === pedido.status) return null

  await tx.pedido.update({ where: { id: pedidoId }, data: { status: novo } })
  await registrarAuditoria(tx, {
    tabela: 'pedidos',
    registroId: pedidoId,
    acao: 'editar',
    antes: { status: pedido.status },
    depois: { status: novo, automatico: true },
    usuarioId,
  })

  if (novo === 'pronto' && pedido.vendedorId) {
    const template = await tx.mensagemTemplate.findFirst({ where: { categoria: 'pedido_pronto', ativo: true }, orderBy: { createdAt: 'asc' } })
    const texto = preencherTemplate(template?.conteudo ?? 'Olá, {{cliente_nome}}! Seu pedido está pronto.', {
      cliente_nome: pedido.cliente.nome.split(' ')[0] ?? pedido.cliente.nome,
      numero_pedido: pedido.numero,
      data_entrega: formatarDataSimples(adicionarDiasUteis(hojeISO(), 0)),
    })
    await tx.notificacao.create({
      data: {
        usuarioId: pedido.vendedorId,
        titulo: `Pedido ${pedido.numero} pronto`,
        // Texto pronto para copiar e colar no WhatsApp do cliente
        mensagem: texto,
        link: `/pedidos/${pedido.id}`,
      },
    })
  }
  return { pedidoId, numero: pedido.numero, antes: pedido.status, depois: novo, vendedorId: pedido.vendedorId }
}

/** Avisa as telas abertas depois do commit. */
export function avisarMudancaPedido(app: FastifyInstance, m: MudancaPedido | null, pedidoId?: string) {
  const id = m?.pedidoId ?? pedidoId
  if (!id) return
  app.tempoReal.emitir('pedidos', 'pedido:atualizado', { id, status: m?.depois })
  if (m?.depois === 'pronto' && m.vendedorId) {
    app.tempoReal.emitir(`usuario:${m.vendedorId}`, 'notificacao:nova', { titulo: `Pedido ${m.numero} pronto`, pedidoId: id })
  }
}
