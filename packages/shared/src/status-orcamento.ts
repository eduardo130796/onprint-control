import { STATUS_ORCAMENTO_ABERTOS, type StatusOrcamento } from './enums-comercial'

/** O que arrastar um orçamento no kanban dispara (as mesmas regras das ações do orçamento). */
export type AcaoKanbanOrcamento = 'enviar' | 'negociacao' | 'reabrir' | 'aprovar' | 'recusar' | 'converter'

const abertos = STATUS_ORCAMENTO_ABERTOS

/**
 * Ação de um arraste de `de` para `para`, ou null se a mudança não existe.
 * Aprovar e recusar pedem um dado (quem aprovou / motivo); converter abre o diálogo de conversão.
 * Expirado só acontece sozinho (validade vencida).
 */
export function acaoKanbanOrcamento(de: StatusOrcamento, para: StatusOrcamento): AcaoKanbanOrcamento | null {
  if (de === para) return null
  if (para === 'enviado') return de === 'rascunho' ? 'enviar' : null
  if (para === 'em_negociacao') return de === 'enviado' ? 'negociacao' : ['aprovado', 'recusado', 'expirado'].includes(de) ? 'reabrir' : null
  if (para === 'aprovado') return abertos.includes(de) ? 'aprovar' : null
  if (para === 'recusado') return abertos.includes(de) ? 'recusar' : null
  if (para === 'convertido') return de === 'aprovado' ? 'converter' : null
  return null
}
