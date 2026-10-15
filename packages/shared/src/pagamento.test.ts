import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import { gerarParcelas } from './parcelas'
import { resumoCondicoesPagamento } from './pagamento'

const resumo = (total: string, sinalPercentual: string, parcelas: number, intervaloDias = 30) => resumoCondicoesPagamento({ total, sinalPercentual, parcelas, intervaloDias })

describe('resumoCondicoesPagamento', () => {
  it('entrada + 1 parcela', () => {
    expect(resumo('900', '50', 1)).toBe('Entrada de R$ 450,00 (50%) na aprovação + 1× de R$ 450,00 em 30 dias')
  })
  it('entrada + várias parcelas', () => {
    expect(resumo('900', '50', 2)).toBe('Entrada de R$ 450,00 (50%) na aprovação + 2× de R$ 225,00 a cada 30 dias')
    expect(resumo('1000', '33.5', 3, 15)).toBe('Entrada de R$ 335,00 (33,5%) na aprovação + 2× de R$ 221,66 e 1× de R$ 221,68 a cada 15 dias')
  })
  it('100% = à vista na aprovação (as parcelas não importam)', () => {
    expect(resumo('900', '100', 3)).toBe('À vista na aprovação')
    expect(resumo('900', '100', 0)).toBe('À vista na aprovação')
  })
  it('sem entrada', () => {
    expect(resumo('900', '0', 3)).toBe('Sem entrada: 3× de R$ 300,00 a cada 30 dias')
    expect(resumo('900', '0', 1)).toBe('Sem entrada: 1× de R$ 900,00 em 30 dias')
  })
  it('parcelas = 0: o restante na retirada/entrega', () => {
    expect(resumo('900', '50', 0)).toBe('Entrada de R$ 450,00 (50%) na aprovação + R$ 450,00 na retirada/entrega')
    expect(resumo('900', '0', 0)).toBe('Sem entrada: R$ 900,00 na retirada/entrega')
  })
  it('centavos: as parcelas do texto somam exatamente o saldo', () => {
    expect(resumo('100', '0', 3)).toBe('Sem entrada: 2× de R$ 33,33 e 1× de R$ 33,34 a cada 30 dias')
    expect(resumo('1000.01', '50', 2)).toBe('Entrada de R$ 500,01 (50%) na aprovação + 2× de R$ 250,00 a cada 30 dias')
    expect(resumo('1000.03', '0', 2)).toBe('Sem entrada: 1× de R$ 500,01 e 1× de R$ 500,02 a cada 30 dias')
  })
  it('muitas parcelas', () => {
    expect(resumo('1000', '10', 24)).toBe('Entrada de R$ 100,00 (10%) na aprovação + 24× de R$ 37,50 a cada 30 dias')
    expect(resumo('1000', '0', 7)).toBe('Sem entrada: 6× de R$ 142,85 e 1× de R$ 142,90 a cada 30 dias')
  })
  it('sem valor', () => {
    expect(resumo('0', '50', 1)).toBe('Sem valor a pagar')
  })
})

describe('gerarParcelas (o que o resumo promete é o que a conversão cobra)', () => {
  it('a soma fecha com o total em qualquer combinação', () => {
    for (const total of ['0.01', '1', '99.99', '100', '1000.01', '12345.67']) {
      for (const sinal of ['0', '10', '33.33', '50', '99.99', '100']) {
        for (const parcelas of [0, 1, 2, 3, 7, 24]) {
          const p = gerarParcelas({ total, sinalPercentual: sinal, parcelas, intervaloDias: 30, hoje: '2026-10-15' })
          expect(p.reduce((s, x) => s.plus(x.valor), new Decimal(0)).toFixed(2)).toBe(new Decimal(total).toFixed(2))
        }
      }
    }
  })
  it('parcelas = 0: o saldo vence na previsão de entrega (se informada)', () => {
    const p = gerarParcelas({ total: '900', sinalPercentual: '50', parcelas: 0, intervaloDias: 30, hoje: '2026-10-15', vencimentoNaEntrega: '2026-10-22' })
    expect(p.map((x) => [x.tipo, x.valor, x.vencimento])).toEqual([
      ['sinal', '450.00', '2026-10-15'],
      ['parcela', '450.00', '2026-10-22'],
    ])
    // Com parcelas, a previsão de entrega não muda nada
    expect(gerarParcelas({ total: '900', sinalPercentual: '50', parcelas: 1, intervaloDias: 30, hoje: '2026-10-15', vencimentoNaEntrega: '2026-10-22' })[1]!.vencimento).toBe('2026-11-14')
  })
})
