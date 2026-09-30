import type { StatusPedido } from './enums-comercial'

/** Etapas da produção (rótulo, cor e ordem editáveis em status_config, entidade "producao"). */
export const ETAPAS_PRODUCAO = ['fila', 'pre_impressao', 'impressao', 'acabamento', 'conferencia', 'concluido'] as const
export type EtapaProducao = (typeof ETAPAS_PRODUCAO)[number]

/** A partir desta etapa a arte do item precisa estar aprovada (exceção: override de gerente). */
export const ETAPAS_QUE_EXIGEM_ARTE: readonly EtapaProducao[] = ['impressao', 'acabamento', 'conferencia', 'concluido']

export const STATUS_ENTREGA = ['pendente', 'agendada', 'realizada', 'cancelada'] as const
export type StatusEntrega = (typeof STATUS_ENTREGA)[number]

export const STATUS_ENTREGA_ROTULOS: Record<StatusEntrega, string> = {
  pendente: 'Pendente',
  agendada: 'Agendada',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
}

/** Pedidos com estes status não contam como atrasados. */
export const STATUS_PEDIDO_SEM_ATRASO: readonly StatusPedido[] = ['pronto', 'em_entrega', 'entregue', 'cancelado']

/**
 * Mudanças de status do pedido que podem ser feitas à mão (kanban de pedidos).
 * As demais acontecem sozinhas: arte enviada, arte aprovada, OPs concluídas, entrega realizada.
 */
export const TRANSICOES_MANUAIS_PEDIDO: Partial<Record<StatusPedido, readonly StatusPedido[]>> = {
  pronto: ['em_entrega', 'entregue'],
  em_entrega: ['pronto', 'entregue'],
}
