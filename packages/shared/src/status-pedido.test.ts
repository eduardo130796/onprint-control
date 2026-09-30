import { describe, expect, it } from 'vitest'
import { statusAutomaticoPedido } from './status-pedido'

describe('statusAutomaticoPedido', () => {
  it('fluxo normal da arte até a produção', () => {
    expect(statusAutomaticoPedido({ status: 'aguardando_arte', artes: ['aguardando_arquivo', 'em_criacao'], ops: ['fila', 'fila'] })).toBe('aguardando_arte')
    expect(statusAutomaticoPedido({ status: 'aguardando_arte', artes: ['enviada_cliente', 'em_criacao'], ops: ['fila', 'fila'] })).toBe('arte_em_aprovacao')
    expect(statusAutomaticoPedido({ status: 'arte_em_aprovacao', artes: ['aprovada', 'aprovada'], ops: ['fila', 'pre_impressao'] })).toBe('em_producao')
  })

  it('vira pronto sozinho quando todas as OPs concluem', () => {
    expect(statusAutomaticoPedido({ status: 'em_producao', artes: ['aprovada', 'aprovada'], ops: ['concluido', 'acabamento'] })).toBe('em_producao')
    expect(statusAutomaticoPedido({ status: 'em_producao', artes: ['aprovada', 'aprovada'], ops: ['concluido', 'concluido'] })).toBe('pronto')
  })

  it('volta para produção se uma OP concluída é reaberta', () => {
    expect(statusAutomaticoPedido({ status: 'pronto', artes: ['aprovada'], ops: ['conferencia'] })).toBe('em_producao')
  })

  it('OP liberada por override (impressão sem arte aprovada) coloca o pedido em produção', () => {
    expect(statusAutomaticoPedido({ status: 'aguardando_arte', artes: ['em_criacao'], ops: ['impressao'] })).toBe('em_producao')
  })

  it('não mexe em status manuais', () => {
    for (const status of ['cancelado', 'em_entrega', 'entregue'] as const) {
      expect(statusAutomaticoPedido({ status, artes: ['aprovada'], ops: ['concluido'] })).toBe(status)
    }
  })
})
