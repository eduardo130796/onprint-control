import type { StatusArte, StatusPedido } from './enums-comercial'
import type { EtapaProducao } from './enums-producao'

export interface SituacaoPedido {
  status: StatusPedido
  /** Status da versão mais recente da arte de cada item */
  artes: StatusArte[]
  /** Etapa de cada OP ativa (não cancelada) */
  ops: EtapaProducao[]
}

const ALEM_DA_PRE_IMPRESSAO: EtapaProducao[] = ['impressao', 'acabamento', 'conferencia', 'concluido']

/**
 * Status que o pedido deve ter a partir das artes e das OPs (seção 9).
 * Cancelado, em entrega e entregue são mudanças manuais e não são sobrescritas.
 *   - todas as OPs concluídas → pronto
 *   - todas as artes aprovadas, ou alguma OP já em impressão (override) → em produção
 *   - alguma arte enviada ao cliente ou com ajuste solicitado → arte em aprovação
 *   - senão → aguardando arte
 */
export function statusAutomaticoPedido(s: SituacaoPedido): StatusPedido {
  if (s.status === 'cancelado' || s.status === 'em_entrega' || s.status === 'entregue') return s.status
  if (s.ops.length > 0 && s.ops.every((e) => e === 'concluido')) return 'pronto'
  const artesAprovadas = s.artes.length > 0 && s.artes.every((a) => a === 'aprovada')
  if (artesAprovadas || s.ops.some((e) => ALEM_DA_PRE_IMPRESSAO.includes(e))) return 'em_producao'
  if (s.artes.some((a) => a === 'enviada_cliente' || a === 'ajuste_solicitado')) return 'arte_em_aprovacao'
  return 'aguardando_arte'
}
