import { describe, expect, it } from 'vitest'
import { CARTAO_ESCURO, CODIGOS_TEMA, TEMAS, contraste, hexParaHsl, temaMaisProximo, temaNoEscuro } from './temas'

describe('temas', () => {
  it.each(CODIGOS_TEMA)('%s: texto sobre a cor e a versão escura sobre fundo claro passam no contraste AA', (codigo) => {
    const t = TEMAS[codigo]
    expect(contraste(t.contraste, t.cor)).toBeGreaterThanOrEqual(4.5)
    expect(contraste(t.escuro, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    expect(contraste(t.escuro, t.suave)).toBeGreaterThanOrEqual(4.5)
  })

  it('converte para HSL', () => {
    expect(hexParaHsl('#25D366')).toBe('142 70% 49%')
  })

  it('sugere a cor da paleta pela cor da logo', () => {
    expect(temaMaisProximo('#1E40AF')).toBe('grafygo')
    expect(temaMaisProximo('#E11D48')).toBe('vinho')
    expect(temaMaisProximo('#16A34A')).toBe('verde')
    expect(temaMaisProximo('#111111')).toBe('grafite')
  })

  it.each(CODIGOS_TEMA)('%s no modo escuro: texto na cor lê bem sobre o cartão e o fundo suave', (codigo) => {
    const t = temaNoEscuro(TEMAS[codigo])
    expect(contraste(t.escuro, CARTAO_ESCURO)).toBeGreaterThanOrEqual(4.5)
    expect(contraste(t.escuro, t.suave)).toBeGreaterThanOrEqual(4.5)
    expect(contraste(t.contraste, t.cor)).toBeGreaterThanOrEqual(4.5)
  })
})
