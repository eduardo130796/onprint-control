import type { PrismaClient } from '@prisma/client'
import type { EventoHistorico } from '@onprint/shared'

const ROTULO_STATUS: Record<string, string> = {
  aguardando_arte: 'Aguardando arte',
  arte_em_aprovacao: 'Arte em aprovação',
  em_producao: 'Em produção',
  pronto: 'Pronto',
  em_entrega: 'Em entrega',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
  fila: 'Fila',
  pre_impressao: 'Pré-impressão',
  impressao: 'Impressão',
  acabamento: 'Acabamento',
  conferencia: 'Conferência',
  concluido: 'Concluído',
}
const rotulo = (s: unknown) => (typeof s === 'string' ? (ROTULO_STATUS[s] ?? s) : '')

/** Linha do tempo do pedido: auditoria (pedido, artes, entregas) + etapas das OPs + comentários das artes. */
export async function historicoDoPedido(prisma: PrismaClient, pedidoId: string): Promise<EventoHistorico[]> {
  const pedido = await prisma.pedido.findUniqueOrThrow({
    where: { id: pedidoId },
    select: {
      itens: { select: { artes: { select: { id: true, versao: true } } } },
      ordensProducao: { select: { id: true, numero: true } },
      entregas: { select: { id: true } },
    },
  })
  const artes = pedido.itens.flatMap((i) => i.artes)
  const idsArtes = artes.map((a) => a.id)
  const versaoDe = new Map(artes.map((a) => [a.id, a.versao]))
  const numeroOp = new Map(pedido.ordensProducao.map((o) => [o.id, o.numero]))

  const [auditoria, etapas, comentarios] = await Promise.all([
    prisma.auditoria.findMany({
      where: {
        OR: [
          { tabela: 'pedidos', registroId: pedidoId },
          { tabela: 'entregas', registroId: { in: pedido.entregas.map((e) => e.id) } },
          { tabela: 'artes', registroId: { in: idsArtes } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    prisma.opEtapaHistorico.findMany({ where: { opId: { in: [...numeroOp.keys()] } }, include: { usuario: { select: { nome: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.arteComentario.findMany({ where: { arteId: { in: idsArtes } }, orderBy: { createdAt: 'desc' } }),
  ])
  const usuarios = new Map(
    (await prisma.usuario.findMany({ where: { id: { in: auditoria.flatMap((a) => (a.usuarioId ? [a.usuarioId] : [])) } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome]),
  )

  const eventos: EventoHistorico[] = []
  for (const a of auditoria) {
    const depois = (a.depois ?? {}) as Record<string, unknown>
    const antes = (a.antes ?? {}) as Record<string, unknown>
    const usuario = a.usuarioId ? (usuarios.get(a.usuarioId) ?? null) : null
    const base = { id: a.id, quando: a.createdAt.toISOString(), usuario }
    if (a.tabela === 'pedidos') {
      if (a.acao === 'criar') eventos.push({ ...base, tipo: 'pedido', titulo: 'Pedido criado', detalhe: depois.orcamento ? `A partir do orçamento ${String(depois.orcamento)}` : null })
      else if (depois.status && antes.status !== depois.status)
        eventos.push({ ...base, tipo: 'pedido', titulo: `Status: ${rotulo(antes.status)} → ${rotulo(depois.status)}`, detalhe: depois.motivo ? `Motivo: ${String(depois.motivo)}` : depois.automatico ? 'Automático' : null })
      else eventos.push({ ...base, tipo: 'pedido', titulo: 'Pedido alterado', detalhe: null })
    } else if (a.tabela === 'artes') {
      const versao = versaoDe.get(a.registroId ?? '')
      const titulo = depois.arquivo ? `Arte v${versao}: arquivo enviado` : depois.status ? `Arte v${versao}: ${String(depois.status).replace(/_/g, ' ')}` : `Arte v${versao} alterada`
      eventos.push({ ...base, tipo: 'arte', titulo, detalhe: depois.via ? `Pelo link público (${String(depois.nome ?? '')})` : depois.arquivo ? String(depois.arquivo) : null })
    } else {
      eventos.push({ ...base, tipo: 'entrega', titulo: a.acao === 'criar' ? 'Entrega registrada' : `Entrega: ${String(depois.status ?? 'alterada')}`, detalhe: depois.recebidoPor ? `Recebido por ${String(depois.recebidoPor)}` : null })
    }
  }
  for (const e of etapas) {
    eventos.push({
      id: e.id,
      quando: e.createdAt.toISOString(),
      usuario: e.usuario?.nome ?? null,
      tipo: 'producao',
      // A liberação sem arte (override) aparece aqui; a auditoria guarda o mesmo registro
      titulo: `${numeroOp.get(e.opId)}: ${e.etapaDe ? `${rotulo(e.etapaDe)} → ` : ''}${rotulo(e.etapaPara)}${e.override ? ' (liberada sem arte aprovada)' : ''}`,
      detalhe: e.override ? `Motivo: ${e.motivo ?? ''}` : null,
    })
  }
  for (const c of comentarios) {
    eventos.push({
      id: c.id,
      quando: c.createdAt.toISOString(),
      usuario: c.autorNome,
      tipo: 'arte',
      titulo: `Arte v${versaoDe.get(c.arteId)}: comentário ${c.origem === 'cliente' ? 'do cliente' : 'interno'}`,
      detalhe: c.texto,
    })
  }
  return eventos.sort((a, b) => b.quando.localeCompare(a.quando))
}
