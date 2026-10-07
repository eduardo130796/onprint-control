import { describe, expect, it } from 'vitest'
import { fundoSuave, razaoContraste, textoLegivel } from './contraste'

describe('contraste', () => {
  it('razão WCAG conhecida', () => {
    expect(razaoContraste('#000000', '#FFFFFF')).toBeCloseTo(21, 0)
    expect(razaoContraste('#FFFFFF', '#FFFFFF')).toBe(1)
  })
  it('cores claras de status ficam legíveis sobre o próprio fundo', () => {
    for (const cor of ['#22C55E', '#F59E0B', '#0EA5E9', '#9CA3AF', '#EF5A57', '#25D366', '#F97316']) {
      expect(razaoContraste(textoLegivel(cor), fundoSuave(cor))).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('cor escura já legível não muda', () => {
    expect(textoLegivel('#2B3036')).toBe('#2B3036')
  })
})
