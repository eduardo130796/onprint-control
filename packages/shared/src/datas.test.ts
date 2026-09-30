import { describe, expect, it } from 'vitest'
import { adicionarDiasUteis, hojeISO, venceuAntesDeHoje } from './datas'
import { gerarParcelas } from './parcelas'

describe('datas', () => {
  it('hoje no fuso de São Paulo', () => {
    expect(hojeISO(new Date('2026-10-01T02:00:00Z'))).toBe('2026-09-30')
  })

  it('dias úteis pulam sábado e domingo', () => {
    // 2026-10-02 é sexta
    expect(adicionarDiasUteis('2026-10-02', 1)).toBe('2026-10-05')
    expect(adicionarDiasUteis('2026-10-02', 3)).toBe('2026-10-07')
    // começando no sábado, 0 dias → segunda
    expect(adicionarDiasUteis('2026-10-03', 0)).toBe('2026-10-05')
  })

  it('vencimento', () => {
    expect(venceuAntesDeHoje('2026-09-28', '2026-09-29')).toBe(true)
    expect(venceuAntesDeHoje('2026-09-29', '2026-09-29')).toBe(false)
  })
})

describe('gerarParcelas', () => {
  it('sinal de 50% + 2 parcelas mensais', () => {
    const p = gerarParcelas({ total: '160', sinalPercentual: '50', parcelas: 2, intervaloDias: 30, hoje: '2026-09-29' })
    expect(p.map((x) => [x.tipo, x.valor, x.vencimento])).toEqual([
      ['sinal', '80.00', '2026-09-29'],
      ['parcela', '40.00', '2026-10-29'],
      ['parcela', '40.00', '2026-11-28'],
    ])
    expect(p[0]?.totalParcelas).toBe(3)
  })

  it('centavos vão para a última parcela e a soma fecha', () => {
    const p = gerarParcelas({ total: '100', sinalPercentual: '0', parcelas: 3, intervaloDias: 30, hoje: '2026-09-29' })
    expect(p.map((x) => x.valor)).toEqual(['33.33', '33.33', '33.34'])
  })

  it('100% de sinal gera só o sinal; sem sinal e sem parcelas gera 1 parcela', () => {
    expect(gerarParcelas({ total: '50', sinalPercentual: '100', parcelas: 3, intervaloDias: 30, hoje: '2026-09-29' })).toHaveLength(1)
    expect(gerarParcelas({ total: '50', sinalPercentual: '0', parcelas: 0, intervaloDias: 30, hoje: '2026-09-29' })).toHaveLength(1)
  })
})
