import { describe, expect, it } from 'vitest'
import { calcularTrocaPlano } from './troca-plano'

describe('troca de plano', () => {
  it('upgrade no meio do período: cobra só a diferença dos dias que faltam', () => {
    // Período 07/10 a 07/11 (31 dias); hoje 23/10 → faltam 15 dias
    const r = calcularTrocaPlano({ valorAtual: '149', valorNovo: '279', inicioPeriodo: '2026-10-07', hoje: '2026-10-23' })
    expect(r).toMatchObject({ tipo: 'upgrade', diasPeriodo: 31, diasRestantes: 15, periodo: { inicio: '2026-10-07', fim: '2026-11-07' }, valeA: '2026-10-23' })
    expect(r.valorProporcional).toBe('62.90') // 130 × 15 ÷ 31 = 62,903…
    expect(r.novaMensalidade).toEqual({ valor: '279.00', aPartirDe: '2026-11-07' })
  })

  it('upgrade no dia do vencimento: diferença do período inteiro', () => {
    expect(calcularTrocaPlano({ valorAtual: '149', valorNovo: '279', inicioPeriodo: '2026-10-07', hoje: '2026-10-07' }).valorProporcional).toBe('130.00')
  })

  it('upgrade no último dia: diferença pequena demais não vira cobrança', () => {
    const r = calcularTrocaPlano({ valorAtual: '279', valorNovo: '299', inicioPeriodo: '2026-10-07', hoje: '2026-11-06' })
    expect(r).toMatchObject({ tipo: 'upgrade', diasRestantes: 1, valorProporcional: null })
  })

  it('downgrade: vale na próxima renovação, sem cobrança e sem estorno', () => {
    const r = calcularTrocaPlano({ valorAtual: '449', valorNovo: '149', inicioPeriodo: '2026-10-07', hoje: '2026-10-20' })
    expect(r).toMatchObject({ tipo: 'downgrade', valorProporcional: null, valeA: '2026-11-07', novaMensalidade: { valor: '149.00', aPartirDe: '2026-11-07' } })
  })

  it('sem período em curso (teste grátis ou sem mensalidade ainda): imediata', () => {
    expect(calcularTrocaPlano({ valorAtual: '149', valorNovo: '279', inicioPeriodo: null, hoje: '2026-10-20' })).toMatchObject({ tipo: 'imediata', valorProporcional: null, valeA: '2026-10-20' })
    // Última mensalidade ficou para trás há mais de um mês: também não há período em curso
    expect(calcularTrocaPlano({ valorAtual: '149', valorNovo: '279', inicioPeriodo: '2026-08-01', hoje: '2026-10-20' }).tipo).toBe('imediata')
  })

  it('mesmo valor: imediata', () => {
    expect(calcularTrocaPlano({ valorAtual: '279', valorNovo: '279.00', inicioPeriodo: '2026-10-07', hoje: '2026-10-20' }).tipo).toBe('imediata')
  })

  it('fevereiro (28 dias) e virada de mês curta', () => {
    const r = calcularTrocaPlano({ valorAtual: '100', valorNovo: '200', inicioPeriodo: '2026-01-31', hoje: '2026-02-14' })
    expect(r).toMatchObject({ periodo: { fim: '2026-02-28' }, diasPeriodo: 28, diasRestantes: 14, valorProporcional: '50.00' })
  })
})
