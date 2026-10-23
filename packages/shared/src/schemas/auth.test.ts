import { describe, expect, it } from 'vitest'
import { OCULTAR_VALORES_PADRAO, normalizarOcultarValores, preferenciasSchema } from './auth'

describe('preferências de "ocultar valores"', () => {
  it('sem nada salvo, fica no padrão (só faturamento)', () => {
    expect(normalizarOcultarValores(null)).toEqual(OCULTAR_VALORES_PADRAO)
    expect(normalizarOcultarValores('lixo')).toEqual(OCULTAR_VALORES_PADRAO)
  })
  it('aproveita o que vale e completa o resto com o padrão', () => {
    expect(normalizarOcultarValores({ orcamentos: 'totais', custoLucro: true, pedidos: 'talvez', painel: 'sim' })).toEqual({
      ...OCULTAR_VALORES_PADRAO,
      orcamentos: 'totais',
      custoLucro: true,
    })
  })
  it('a conta só aceita o conjunto completo e válido', () => {
    expect(preferenciasSchema.safeParse({ ocultarValores: OCULTAR_VALORES_PADRAO }).success).toBe(true)
    expect(preferenciasSchema.safeParse({ ocultarValores: { ...OCULTAR_VALORES_PADRAO, orcamentos: 'metade' } }).success).toBe(false)
    expect(preferenciasSchema.safeParse({ ocultarValores: { painel: true } }).success).toBe(false)
  })
})
