import { describe, expect, it } from 'vitest'
import { valorPorExtenso } from './extenso'

describe('valorPorExtenso', () => {
  it.each([
    [1, 'um real'],
    [2, 'dois reais'],
    [16, 'dezesseis reais'],
    [21, 'vinte e um reais'],
    [100, 'cem reais'],
    [101, 'cento e um reais'],
    [350, 'trezentos e cinquenta reais'],
    [1000, 'mil reais'],
    [1050, 'mil e cinquenta reais'],
    [1100, 'mil e cem reais'],
    [1234, 'mil duzentos e trinta e quatro reais'],
    [2500, 'dois mil e quinhentos reais'],
    [21_000, 'vinte e um mil reais'],
    [1_000_000, 'um milhão de reais'],
    [2_000_100, 'dois milhões e cem reais'],
    [0.5, 'cinquenta centavos'],
    [0.01, 'um centavo'],
    [10.05, 'dez reais e cinco centavos'],
    ['175.00', 'cento e setenta e cinco reais'],
    [0, 'zero real'],
  ])('%s → %s', (v, esperado) => {
    expect(valorPorExtenso(v)).toBe(esperado)
  })
})
