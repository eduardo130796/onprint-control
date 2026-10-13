import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import {
  TEXTOS_PADRAO_WHATSAPP,
  formatarDataSimples,
  formatarMoeda,
  nomeCliente,
  nomeParaSaudacao,
  normalizarNumeroWhatsapp,
  preencherMensagem,
  type EventoWhatsapp,
  type StatusPedido,
} from '@onprint/shared'
import { contextoEmpresa, type EmpresaAtual } from '../../core/contexto-empresa'
import { linkAcompanhamento } from '../../core/links'
import { EVENTO_DO_STATUS, JANELA_DUPLICADO_MS, motivoParaNaoAvisar } from './regras'

export interface AlvoAviso {
  pedidoId: string
  /** Arte enviada ao cliente (link de aprovação) */
  arteId?: string
  /** Pagamento (movimento financeiro) que gerou o aviso */
  movimentoId?: string
  /** Valor do pagamento (pagamento_recebido) */
  valorPago?: string
}

/** Configuração única da empresa (criada com os padrões no primeiro uso). */
export async function obterConfigWhatsapp(prisma: PrismaClient) {
  return (await prisma.whatsappConfig.findFirst({ orderBy: { createdAt: 'asc' } })) ?? prisma.whatsappConfig.create({ data: {} })
}

/** WhatsApp liberado no plano da empresa (o módulo "whatsapp") */
export const whatsappNoPlano = (empresa: EmpresaAtual | undefined) => !empresa?.assinatura || empresa.assinatura.modulos.includes('whatsapp')

/** Nome da gráfica na assinatura das mensagens */
export async function nomeDaEmpresa(prisma: PrismaClient, empresa: EmpresaAtual) {
  const c = await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { nomeFantasia: true, razaoSocial: true } })
  return c?.nomeFantasia?.trim() || c?.razaoSocial?.trim() || empresa.nome
}

/**
 * Coloca o aviso na fila (o envio é do job, respeitando horário e intervalo). Chamar DEPOIS do commit:
 * nunca lança erro, o aviso do WhatsApp não pode derrubar a operação do sistema.
 */
export function criarAvisosWhatsapp(app: FastifyInstance, aoEnfileirar: (empresaId: string) => void) {
  async function enfileirar(evento: EventoWhatsapp, alvo: AlvoAviso): Promise<string | null> {
    const empresa = contextoEmpresa.atual()
    if (!empresa || !whatsappNoPlano(empresa)) return null
    const { prisma } = app
    const config = await obterConfigWhatsapp(prisma)
    const pedido = await prisma.pedido.findUnique({
      where: { id: alvo.pedidoId },
      select: {
        id: true,
        numero: true,
        tokenPublico: true,
        dataPrevistaEntrega: true,
        cliente: { select: { id: true, nome: true, fantasia: true, cpfCnpj: true, whatsapp: true, telefone: true, receberAvisosWhatsapp: true } },
      },
    })
    if (!pedido) return null
    const referenciaId = alvo.arteId ?? alvo.movimentoId ?? null
    const repetido = await prisma.mensagemWhatsapp.findFirst({
      where: { evento, pedidoId: pedido.id, referenciaId, status: { in: ['pendente', 'enviada'] }, createdAt: { gte: new Date(Date.now() - JANELA_DUPLICADO_MS) } },
      select: { id: true },
    })
    // WhatsApp do cadastro; sem ele, o telefone serve se for celular
    const numero = normalizarNumeroWhatsapp(pedido.cliente.whatsapp) ?? (normalizarNumeroWhatsapp(pedido.cliente.telefone)?.length === 13 ? normalizarNumeroWhatsapp(pedido.cliente.telefone) : null)
    const motivo = motivoParaNaoAvisar({
      eventoLigado: config.eventos.includes(evento),
      simulado: app.whatsapp.provedor.simulado,
      conectou: Boolean(config.conectadoEm),
      clienteRecusa: !pedido.cliente.receberAvisosWhatsapp,
      numero,
      duplicado: Boolean(repetido),
    })
    if (motivo && !motivo.registrar) return null

    let linkArte = ''
    if (alvo.arteId) {
      const arte = await prisma.arte.findUnique({ where: { id: alvo.arteId }, select: { tokenPublico: true } })
      if (arte) linkArte = `${app.config.APP_URL}/arte/${empresa.slug}/${arte.tokenPublico}`
    }
    const template = await prisma.mensagemTemplate.findFirst({ where: { categoria: evento, ativo: true }, orderBy: { createdAt: 'asc' } })
    const texto = preencherMensagem(template?.conteudo ?? TEXTOS_PADRAO_WHATSAPP[evento], {
      cliente_nome: nomeParaSaudacao(nomeCliente(pedido.cliente), pedido.cliente.cpfCnpj),
      numero_pedido: pedido.numero,
      data_entrega: formatarDataSimples(pedido.dataPrevistaEntrega.toISOString()),
      link_acompanhamento: linkAcompanhamento(pedido.tokenPublico, empresa.slug),
      link_aprovacao: linkArte,
      valor_pago: alvo.valorPago ? formatarMoeda(alvo.valorPago) : '',
      empresa_nome: await nomeDaEmpresa(prisma, empresa),
    })
    const criada = await prisma.mensagemWhatsapp.create({
      data: {
        clienteId: pedido.cliente.id,
        pedidoId: pedido.id,
        referenciaId,
        evento,
        telefone: numero ?? pedido.cliente.whatsapp ?? pedido.cliente.telefone ?? '',
        texto,
        status: motivo ? 'ignorada' : 'pendente',
        erro: motivo?.motivo ?? null,
      },
      select: { id: true },
    })
    if (!motivo) aoEnfileirar(empresa.id)
    return criada.id
  }

  /** Enfileira (ou registra por que não) o aviso; erros vão para o log. */
  async function avisar(evento: EventoWhatsapp, alvo: AlvoAviso): Promise<string | null> {
    try {
      return await enfileirar(evento, alvo)
    } catch (erro) {
      app.log.warn({ err: erro, evento, pedidoId: alvo.pedidoId }, 'Aviso do WhatsApp não enfileirado')
      return null
    }
  }

  return {
    avisar,
    /** Pedido mudou de status: pronto, em entrega e entregue geram aviso */
    avisarStatusPedido(pedidoId: string, status: StatusPedido | undefined) {
      const evento = status ? EVENTO_DO_STATUS[status] : undefined
      return evento ? avisar(evento, { pedidoId }) : Promise.resolve(null)
    },
  }
}

export type AvisosWhatsapp = ReturnType<typeof criarAvisosWhatsapp>
