import { describe, expect, it } from 'vitest'
import { diferencaDasParcelas, dividirEmParcelas, parcelasParaApi, totalDaEntrada } from './pagamento'

describe('pagamento da compra', () => {
  it('calcula o total como a API (cada item arredondado em centavos)', () => {
    expect(totalDaEntrada([{ quantidade: '320', custoUnitario: '9,0625' }])).toBe('2900.00')
    // 3 × 0,3333 = 0,9999 → 1,00; 1,5 × 2,005 = 3,0075 → 3,01
    expect(totalDaEntrada([{ quantidade: '3', custoUnitario: '0.3333' }, { quantidade: '1,5', custoUnitario: '2,005' }])).toBe('4.01')
    expect(totalDaEntrada([{ quantidade: '', custoUnitario: 'abc' }])).toBe('0.00')
  })

  it('divide o total em parcelas a cada 30 dias, com os centavos na última', () => {
    const p = dividirEmParcelas('100.00', 3, '2026-10-09')
    expect(p).toEqual([
      { vencimento: '2026-11-08', valor: '33,33' },
      { vencimento: '2026-12-08', valor: '33,33' },
      { vencimento: '2027-01-07', valor: '33,34' },
    ])
    expect(diferencaDasParcelas('100.00', p)).toBe('0.00')
  })

  it('uma parcela vence em 30 dias; limita entre 1 e 12', () => {
    expect(dividirEmParcelas('1234.56', 1, '2026-01-31')).toEqual([{ vencimento: '2026-03-02', valor: '1.234,56' }])
    expect(dividirEmParcelas('10', 0, '2026-01-01')).toHaveLength(1)
    expect(dividirEmParcelas('10', 40, '2026-01-01')).toHaveLength(12)
    const doze = dividirEmParcelas('0.10', 12, '2026-01-01')
    expect(diferencaDasParcelas('0.10', doze)).toBe('0.00')
  })

  it('mostra a diferença quando as parcelas editadas não fecham', () => {
    const p = [
      { vencimento: '2026-11-08', valor: '50,00' },
      { vencimento: '2026-12-08', valor: '40,00' },
    ]
    expect(diferencaDasParcelas('100.00', p)).toBe('10.00')
    expect(diferencaDasParcelas('80.00', p)).toBe('-10.00')
    expect(parcelasParaApi(p)).toEqual([
      { vencimento: '2026-11-08', valor: '50.00' },
      { vencimento: '2026-12-08', valor: '40.00' },
    ])
  })
})
