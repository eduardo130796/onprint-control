import { describe, expect, it } from 'vitest'
import { formatarDuracao } from './datas'

describe('formatarDuracao', () => {
  it('minutos, horas e dias', () => {
    expect(formatarDuracao(45 * 60)).toBe('45 min')
    expect(formatarDuracao(3 * 3600 + 20 * 60)).toBe('3 h 20 min')
    expect(formatarDuracao(2 * 3600)).toBe('2 h')
    expect(formatarDuracao(52 * 3600)).toBe('2 d 4 h')
  })
})
