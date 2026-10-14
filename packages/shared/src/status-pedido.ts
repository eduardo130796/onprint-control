import type { StatusArte, StatusPedido } from './enums-comercial'
import { ETAPAS_QUE_EXIGEM_ARTE, type EtapaProducao } from './enums-producao'

export interface SituacaoPedido {
  status: StatusPedido
  /** Status da versão mais recente da arte de cada item que precisa de arte (itens "sem arte" ficam de fora) */
  artes: StatusArte[]
  /** Etapa de cada OP ativa (não cancelada) */
  ops: EtapaProducao[]
  /**
   * Etapa das OPs ativas de itens que precisam de arte (ausente = todas). Só elas, já em impressão (override),
   * levam o pedido para a produção: a OP de um item sem arte anda sozinha sem tirar o pedido da etapa da arte.
   */
  opsComArte?: EtapaProducao[]
}

const ALEM_DA_PRE_IMPRESSAO: EtapaProducao[] = ['impressao', 'acabamento', 'conferencia', 'concluido']

/**
 * Status que o pedido deve ter a partir das artes e das OPs (seção 9).
 * Cancelado, em entrega e entregue são mudanças manuais e não são sobrescritas.
 *   - todas as OPs concluídas → pronto
 *   - todas as artes aprovadas (ou nenhum item precisa de arte), ou alguma OP de item com arte já em impressão
 *     (override) → em produção
 *   - alguma arte enviada ao cliente ou com ajuste solicitado → arte em aprovação
 *   - senão → aguardando arte
 */
export function statusAutomaticoPedido(s: SituacaoPedido): StatusPedido {
  if (s.status === 'cancelado' || s.status === 'em_entrega' || s.status === 'entregue') return s.status
  if (s.ops.length > 0 && s.ops.every((e) => e === 'concluido')) return 'pronto'
  const artesAprovadas = s.artes.every((a) => a === 'aprovada')
  if (artesAprovadas || (s.opsComArte ?? s.ops).some((e) => ALEM_DA_PRE_IMPRESSAO.includes(e))) return 'em_producao'
  if (s.artes.some((a) => a === 'enviada_cliente' || a === 'ajuste_solicitado')) return 'arte_em_aprovacao'
  return 'aguardando_arte'
}

/** Item do pedido com a última versão da arte (a primeira da lista, ordenada da mais nova) */
export interface ItemComArte {
  precisaArte: boolean
  artes: { status: StatusArte }[]
}

/** Itens que esperam a arte antes de produzir (os "sem arte" não contam em regra nem contador) */
export const itensComArte = <I extends { precisaArte: boolean }>(itens: I[]): I[] => itens.filter((i) => i.precisaArte)

/** Status da última arte de cada item que precisa de arte; item sem versão ainda conta como "aguardando arquivo" */
export const statusArtesQueContam = (itens: ItemComArte[]): StatusArte[] => itensComArte(itens).map((i) => i.artes[0]?.status ?? 'aguardando_arquivo')

/** "Artes aprovadas X de Y": só os itens que precisam de arte */
export function contagemArtes(itens: ItemComArte[]): { aprovadas: number; total: number } {
  const status = statusArtesQueContam(itens)
  return { aprovadas: status.filter((a) => a === 'aprovada').length, total: status.length }
}

/**
 * A OP vai entrar na zona que exige arte aprovada (impressão em diante) sem a arte aprovada: precisa da liberação
 * do gerente. Item sem arte nunca trava; depois de liberada (já na zona), a OP segue sem nova liberação.
 */
export function opPrecisaLiberarArte(p: { de: EtapaProducao; para: EtapaProducao; precisaArte: boolean; arte: StatusArte | null | undefined }): boolean {
  if (!p.precisaArte || p.de === p.para || p.arte === 'aprovada') return false
  return ETAPAS_QUE_EXIGEM_ARTE.includes(p.para) && !ETAPAS_QUE_EXIGEM_ARTE.includes(p.de)
}
