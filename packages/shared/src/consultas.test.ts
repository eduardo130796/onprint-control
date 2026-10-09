import { describe, expect, it } from 'vitest'
import { capitalizarNome } from './consultas'

describe('capitalizarNome', () => {
  it('capitaliza texto em maiúsculas da Receita', () => {
    expect(capitalizarNome('AVENIDA REPUBLICA DO CHILE')).toBe('Avenida Republica do Chile')
    expect(capitalizarNome('  RUA  XV DE NOVEMBRO ')).toBe('Rua XV de Novembro')
    expect(capitalizarNome('SAO JOAO D\'OESTE')).toBe("Sao Joao D'Oeste")
    expect(capitalizarNome('GUARDA-MOR')).toBe('Guarda-Mor')
    expect(capitalizarNome('E DA SILVA')).toBe('E da Silva')
    expect(capitalizarNome('JARDIM ÁGUA AZUL')).toBe('Jardim Água Azul')
    expect(capitalizarNome('TORRE I, II, III; IV.')).toBe('Torre I, II, III; IV.')
  })

  it('mantém texto que já tem minúsculas e trata vazios', () => {
    expect(capitalizarNome('São Paulo')).toBe('São Paulo')
    expect(capitalizarNome('Av. MIX de letras')).toBe('Av. MIX de letras')
    expect(capitalizarNome(null)).toBe('')
    expect(capitalizarNome('   ')).toBe('')
  })
})
