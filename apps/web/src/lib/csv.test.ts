import { describe, expect, it } from 'vitest'
import { gerarCsv, neutralizarFormula } from './csv'

describe('neutralizarFormula', () => {
  it('prefixa apóstrofo em texto que o Excel leria como fórmula', () => {
    expect(neutralizarFormula('=HYPERLINK("http://x","clique")')).toBe(`'=HYPERLINK("http://x","clique")`)
    expect(neutralizarFormula('+1+cmd|calc')).toBe(`'+1+cmd|calc`)
    expect(neutralizarFormula('-2+3')).toBe(`'-2+3`)
    expect(neutralizarFormula('@SUM(A1)')).toBe(`'@SUM(A1)`)
    expect(neutralizarFormula('\t=1')).toBe(`'\t=1`)
    expect(neutralizarFormula('\r=1')).toBe(`'\r=1`)
  })

  it('mantém números e texto comum', () => {
    expect(neutralizarFormula(-10)).toBe('-10')
    expect(neutralizarFormula('-10,00')).toBe('-10,00')
    expect(neutralizarFormula('-1.234,56')).toBe('-1.234,56')
    expect(neutralizarFormula('+5')).toBe('+5')
    expect(neutralizarFormula('Gráfica A=B')).toBe('Gráfica A=B')
    expect(neutralizarFormula(null)).toBe('')
    expect(neutralizarFormula(undefined)).toBe('')
  })
})

describe('gerarCsv', () => {
  it('neutraliza antes de aplicar as aspas', () => {
    const csv = gerarCsv([{ titulo: 'Nome', valor: (l: { nome: string }) => l.nome }], [{ nome: '=1;2' }, { nome: '-3' }])
    expect(csv).toBe('﻿Nome\r\n"\'=1;2"\r\n-3')
  })
})
