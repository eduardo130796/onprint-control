import { describe, expect, it } from 'vitest'
import { estimarHoras } from '../src/modules/producao/geracao'
import { semanaDe } from '../src/modules/producao/pcp.service'

describe('estimarHoras', () => {
  it('área ÷ velocidade da máquina', () => {
    // 6 m² numa plotter de 12 m²/h = 0,5 h
    expect(estimarHoras('6', '12', 0)).toBe('0.50')
  })

  it('sem velocidade ou sem área usa os tempos padrão dos processos', () => {
    expect(estimarHoras('0', '12', 90)).toBe('1.50')
    expect(estimarHoras('6', null, 30)).toBe('0.50')
    expect(estimarHoras('0', null, 0)).toBe('0.00')
  })
})

describe('semanaDe', () => {
  it('vai de segunda a domingo', () => {
    expect(semanaDe('2026-09-30')).toEqual({ inicio: '2026-09-28', fim: '2026-10-04' }) // quarta
    expect(semanaDe('2026-10-04')).toEqual({ inicio: '2026-09-28', fim: '2026-10-04' }) // domingo
    expect(semanaDe('2026-09-28')).toEqual({ inicio: '2026-09-28', fim: '2026-10-04' }) // segunda
  })
})
