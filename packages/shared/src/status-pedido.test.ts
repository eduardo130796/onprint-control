import { describe, expect, it } from 'vitest'
import { contagemArtes, opPrecisaLiberarArte, statusArtesQueContam, statusAutomaticoPedido } from './status-pedido'

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

describe('statusAutomaticoPedido: aprovação da arte pelo cliente é opcional', () => {
  it('arte em criação (não enviada ao cliente) nunca deixa o pedido "em aprovação"', () => {
    expect(statusAutomaticoPedido({ status: 'aguardando_arte', artes: ['em_criacao', 'em_criacao'], ops: ['fila', 'fila'] })).toBe('aguardando_arte')
  })
  it('aprovação interna (sem passar pelo cliente) leva direto para a produção', () => {
    expect(statusAutomaticoPedido({ status: 'aguardando_arte', artes: ['aprovada', 'aprovada'], ops: ['fila', 'fila'] })).toBe('em_producao')
  })
  it('"Cliente aprovou todas as artes": de "em aprovação" para a produção', () => {
    expect(statusAutomaticoPedido({ status: 'arte_em_aprovacao', artes: ['aprovada', 'aprovada'], ops: [] })).toBe('em_producao')
  })
  it('entregue com arte ainda "enviada ao cliente" continua entregue', () => {
    expect(statusAutomaticoPedido({ status: 'entregue', artes: ['enviada_cliente'], ops: ['concluido'] })).toBe('entregue')
  })
})

describe('Arte opcional por item', () => {
  const item = (precisaArte: boolean, status?: 'aguardando_arquivo' | 'em_criacao' | 'enviada_cliente' | 'aprovada') => ({ precisaArte, artes: status ? [{ status }] : [] })

  it('nenhum item precisa de arte: o pedido nasce em produção', () => {
    const artes = statusArtesQueContam([item(false), item(false, 'aguardando_arquivo')])
    expect(artes).toEqual([])
    expect(statusAutomaticoPedido({ status: 'aguardando_arte', artes, ops: ['fila', 'fila'] })).toBe('em_producao')
  })
  it('misto: só o item com arte segura o pedido', () => {
    const itens = [item(false), item(true, 'aguardando_arquivo')]
    expect(statusAutomaticoPedido({ status: 'aguardando_arte', artes: statusArtesQueContam(itens), ops: ['fila', 'fila'] })).toBe('aguardando_arte')
    const enviada = [item(false), item(true, 'enviada_cliente')]
    expect(statusAutomaticoPedido({ status: 'aguardando_arte', artes: statusArtesQueContam(enviada), ops: ['fila', 'fila'] })).toBe('arte_em_aprovacao')
    // Arte do item "sem arte" esquecida em criação não segura nada
    const aprovada = [item(false, 'em_criacao'), item(true, 'aprovada')]
    expect(statusAutomaticoPedido({ status: 'aguardando_arte', artes: statusArtesQueContam(aprovada), ops: ['fila', 'fila'] })).toBe('em_producao')
  })
  it('OP do item sem arte já imprimindo não tira o pedido da etapa da arte; a do item com arte (override) tira', () => {
    const artes = statusArtesQueContam([item(false), item(true, 'em_criacao')])
    expect(statusAutomaticoPedido({ status: 'aguardando_arte', artes, ops: ['fila', 'impressao'], opsComArte: ['fila'] })).toBe('aguardando_arte')
    expect(statusAutomaticoPedido({ status: 'aguardando_arte', artes, ops: ['impressao', 'fila'], opsComArte: ['impressao'] })).toBe('em_producao')
  })
  it('todas as artes aprovadas: produção (como antes)', () => {
    const itens = [item(true, 'aprovada'), item(true, 'aprovada')]
    expect(statusAutomaticoPedido({ status: 'arte_em_aprovacao', artes: statusArtesQueContam(itens), ops: ['fila'] })).toBe('em_producao')
  })
  it('item que precisa de arte e ainda não tem versão conta como aguardando arquivo', () => {
    expect(statusArtesQueContam([item(true)])).toEqual(['aguardando_arquivo'])
  })
  it('pronto, entrega, entregue e cancelado seguem valendo sem arte', () => {
    expect(statusAutomaticoPedido({ status: 'em_producao', artes: [], ops: ['concluido'] })).toBe('pronto')
    for (const status of ['cancelado', 'em_entrega', 'entregue'] as const) expect(statusAutomaticoPedido({ status, artes: [], ops: ['fila'] })).toBe(status)
  })
  it('"Artes aprovadas X de Y" conta só os itens que precisam de arte', () => {
    expect(contagemArtes([item(false, 'em_criacao'), item(true, 'aprovada'), item(true, 'em_criacao')])).toEqual({ aprovadas: 1, total: 2 })
    expect(contagemArtes([item(false)])).toEqual({ aprovadas: 0, total: 0 })
  })
})

describe('opPrecisaLiberarArte (trava da OP)', () => {
  it('item com arte não aprovada: entrar na impressão exige a liberação do gerente', () => {
    expect(opPrecisaLiberarArte({ de: 'pre_impressao', para: 'impressao', precisaArte: true, arte: 'em_criacao' })).toBe(true)
    expect(opPrecisaLiberarArte({ de: 'fila', para: 'concluido', precisaArte: true, arte: undefined })).toBe(true)
  })
  it('item sem arte: segue para a impressão sem liberação', () => {
    expect(opPrecisaLiberarArte({ de: 'pre_impressao', para: 'impressao', precisaArte: false, arte: undefined })).toBe(false)
    expect(opPrecisaLiberarArte({ de: 'fila', para: 'impressao', precisaArte: false, arte: 'em_criacao' })).toBe(false)
  })
  it('arte aprovada, mesma etapa, etapas antes da impressão ou OP já liberada: não trava', () => {
    expect(opPrecisaLiberarArte({ de: 'pre_impressao', para: 'impressao', precisaArte: true, arte: 'aprovada' })).toBe(false)
    expect(opPrecisaLiberarArte({ de: 'fila', para: 'pre_impressao', precisaArte: true, arte: 'em_criacao' })).toBe(false)
    expect(opPrecisaLiberarArte({ de: 'impressao', para: 'acabamento', precisaArte: true, arte: 'em_criacao' })).toBe(false)
    expect(opPrecisaLiberarArte({ de: 'impressao', para: 'impressao', precisaArte: true, arte: 'em_criacao' })).toBe(false)
  })
})
