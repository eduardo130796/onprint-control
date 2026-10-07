import { describe, expect, it } from 'vitest'
import { acaoKanbanOrcamento } from './status-orcamento'

describe('acaoKanbanOrcamento', () => {
  it('segue o fluxo do orçamento', () => {
    expect(acaoKanbanOrcamento('rascunho', 'enviado')).toBe('enviar')
    expect(acaoKanbanOrcamento('enviado', 'em_negociacao')).toBe('negociacao')
    expect(acaoKanbanOrcamento('em_negociacao', 'aprovado')).toBe('aprovar')
    expect(acaoKanbanOrcamento('rascunho', 'recusado')).toBe('recusar')
    expect(acaoKanbanOrcamento('aprovado', 'convertido')).toBe('converter')
  })
  it('reabre aprovado, recusado ou expirado para negociação', () => {
    for (const de of ['aprovado', 'recusado', 'expirado'] as const) expect(acaoKanbanOrcamento(de, 'em_negociacao')).toBe('reabrir')
  })
  it('bloqueia o que não existe', () => {
    expect(acaoKanbanOrcamento('convertido', 'em_negociacao')).toBeNull()
    expect(acaoKanbanOrcamento('rascunho', 'expirado')).toBeNull()
    expect(acaoKanbanOrcamento('em_negociacao', 'convertido')).toBeNull()
    expect(acaoKanbanOrcamento('em_negociacao', 'enviado')).toBeNull()
    expect(acaoKanbanOrcamento('aprovado', 'aprovado')).toBeNull()
  })
})
