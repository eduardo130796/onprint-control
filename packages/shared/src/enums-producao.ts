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

/** Status finais do pedido: não saem pelo kanban (cancelado só pelo botão Cancelar, com motivo). */
export const STATUS_PEDIDO_FINAIS: readonly StatusPedido[] = ['entregue', 'cancelado']

/**
 * Mudança manual de status (kanban de pedidos): livre entre as colunas, exceto sair de um status final
 * ou cancelar arrastando. A automação continua valendo: quando a arte ou as OPs mudarem depois,
 * o status é recalculado (em entrega e entregue não são sobrescritos).
 */
export function podeMudarStatusPedido(de: StatusPedido, para: StatusPedido): boolean {
  return de !== para && !STATUS_PEDIDO_FINAIS.includes(de) && para !== 'cancelado'
}
