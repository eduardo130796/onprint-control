import { describe, expect, it } from 'vitest'
import { decimal3, normalizarDecimal, valorMonetario } from './campos'
import { orcamentoItemSchema } from './comercial'

describe('normalizarDecimal (valores grandes)', () => {
  it('padrão brasileiro com vírgula: pontos são milhar', () => {
    expect(normalizarDecimal('9,00')).toBe('9.00')
    expect(normalizarDecimal('900,00')).toBe('900.00')
    expect(normalizarDecimal('1.400,00')).toBe('1400.00')
    expect(normalizarDecimal('14.000,00')).toBe('14000.00')
    expect(normalizarDecimal('1.234.567,89')).toBe('1234567.89')
    expect(normalizarDecimal('1000,5')).toBe('1000.5')
  })

  it('formato da API (sem vírgula) passa direto', () => {
    expect(normalizarDecimal('14000.00')).toBe('14000.00')
    expect(normalizarDecimal('1000')).toBe('1000')
    expect(normalizarDecimal(14000)).toBe('14000')
  })

  it('"1.000" sem vírgula é o decimal da API (= 1): a tela nunca pode mandar milhar sem vírgula', () => {
    expect(normalizarDecimal('1.000')).toBe('1.000')
    expect(Number(decimal3.parse('1.000'))).toBe(1)
  })
})

describe('valores ≥ 1.000 e ≥ 10.000 nos schemas', () => {
  it('valor monetário', () => {
    expect(valorMonetario.parse('1.400,00')).toBe('1400.00')
    expect(valorMonetario.parse('14.000,00')).toBe('14000.00')
    expect(valorMonetario.parse('14000.00')).toBe('14000.00')
  })

  it('quantidade e medidas do item do orçamento', () => {
    const item = orcamentoItemSchema.parse({ produtoId: '6f1c7a3e-2b4d-4c8e-9a1f-0e2d3c4b5a69', quantidade: '10000', largura: '1000,5', altura: '2,5', precoUnitario: '14.000,00', desconto: '1.400,00' })
    expect(item).toMatchObject({ quantidade: '10000', largura: '1000.5', altura: '2.5', precoUnitario: '14000.00', desconto: '1400.00' })
  })
})
