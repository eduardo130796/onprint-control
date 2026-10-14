import { describe, expect, it } from 'vitest'
import { arteAguardaCliente, artesParaAprovarTodas, caminhoAcompanhamento, mostrarAprovacaoArte } from './acompanhamento'

describe('caminhoAcompanhamento', () => {
  it('monta /pedido/:empresa/:token', () => {
    expect(caminhoAcompanhamento('ponto-visual', 'abc123')).toBe('/pedido/ponto-visual/abc123')
  })
})

describe('pedido de aprovação da arte na página do pedido', () => {
  it('aparece enquanto alguma arte aguarda o cliente e o pedido está na etapa da arte', () => {
    expect(mostrarAprovacaoArte('arte_em_aprovacao', ['enviada_cliente', 'aprovada'])).toBe(true)
    expect(mostrarAprovacaoArte('aguardando_arte', ['em_criacao', 'enviada_cliente'])).toBe(true)
  })
  it('nada aguardando o cliente (aprovação interna, em criação ou ajuste): não aparece', () => {
    expect(mostrarAprovacaoArte('aguardando_arte', ['em_criacao', null])).toBe(false)
    expect(mostrarAprovacaoArte('arte_em_aprovacao', ['ajuste_solicitado'])).toBe(false)
    expect(mostrarAprovacaoArte('em_producao', ['aprovada', 'aprovada'])).toBe(false)
  })
  it('pedido que passou da arte nunca mais pede aprovação (o caso do pedido entregue com arte "enviada")', () => {
    for (const status of ['em_producao', 'pronto', 'em_entrega', 'entregue', 'cancelado'] as const) {
      expect(mostrarAprovacaoArte(status, ['enviada_cliente'])).toBe(false)
      expect(arteAguardaCliente(status, 'enviada_cliente')).toBe(false)
    }
  })
})

describe('"Cliente aprovou todas as artes"', () => {
  it('aprova só as que têm arquivo e estão com o cliente ou em criação', () => {
    const artes = [
      { id: 'a', status: 'enviada_cliente', arquivoId: 'f1' },
      { id: 'b', status: 'em_criacao', arquivoId: 'f2' },
      { id: 'c', status: 'em_criacao', arquivoId: null },
      { id: 'd', status: 'aprovada', arquivoId: 'f4' },
      { id: 'e', status: 'ajuste_solicitado', arquivoId: 'f5' },
      { id: 'f', status: 'aguardando_arquivo', arquivoId: null },
    ] as const
    expect(artesParaAprovarTodas([...artes]).map((a) => a.id)).toEqual(['a', 'b'])
    expect(artesParaAprovarTodas([])).toEqual([])
  })
})
