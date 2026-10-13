import { describe, expect, it } from 'vitest'
import { caminhoAcompanhamento } from './acompanhamento'

describe('caminhoAcompanhamento', () => {
  it('monta /pedido/:empresa/:token', () => {
    expect(caminhoAcompanhamento('ponto-visual', 'abc123')).toBe('/pedido/ponto-visual/abc123')
  })
})
