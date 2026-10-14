import { describe, expect, it } from 'vitest'
import { decimalParaCampo, decimalParaInput, mascaraCep, mascaraCpfCnpj, mascaraMoeda, mascaraTelefone } from './mascaras'
import { gerarCsv } from './csv'

describe('máscaras', () => {
  it('CPF e CNPJ progressivos', () => {
    expect(mascaraCpfCnpj('529982')).toBe('529.982')
    expect(mascaraCpfCnpj('52998224725')).toBe('529.982.247-25')
    expect(mascaraCpfCnpj('11222333000181')).toBe('11.222.333/0001-81')
  })

  it('telefone fixo e celular', () => {
    expect(mascaraTelefone('11')).toBe('(11')
    expect(mascaraTelefone('1133334444')).toBe('(11) 3333-4444')
    expect(mascaraTelefone('11987654321')).toBe('(11) 98765-4321')
  })

  it('CEP', () => {
    expect(mascaraCep('01310100')).toBe('01310-100')
  })

  it('moeda por centavos', () => {
    expect(mascaraMoeda('5')).toBe('0,05')
    expect(mascaraMoeda('123456')).toBe('1.234,56')
    expect(mascaraMoeda('')).toBe('0,00')
    expect(decimalParaInput('1500.5')).toBe('1.500,50')
  })

  it('moeda com valores ≥ 1.000 e ≥ 10.000', () => {
    expect(mascaraMoeda('900')).toBe('9,00')
    expect(mascaraMoeda('140000')).toBe('1.400,00')
    expect(mascaraMoeda('1400000')).toBe('14.000,00')
    expect(mascaraMoeda(14000)).toBe('14.000,00')
    expect(decimalParaInput('14000.00')).toBe('14.000,00')
    expect(decimalParaInput('14000')).toBe('14.000,00')
    expect(decimalParaInput(9)).toBe('9,00')
  })

  it('decimal da API para campo numérico: sem milhar e sem zeros sobrando', () => {
    expect(decimalParaCampo('1000.000')).toBe('1000')
    expect(decimalParaCampo('1000')).toBe('1000')
    expect(decimalParaCampo('10000.000')).toBe('10000')
    expect(decimalParaCampo('1500')).toBe('1500')
    expect(decimalParaCampo('1234.5')).toBe('1234,5')
    expect(decimalParaCampo('2.500')).toBe('2,5')
    expect(decimalParaCampo('0.125')).toBe('0,125')
    expect(decimalParaCampo('10')).toBe('10')
    expect(decimalParaCampo(null)).toBe('')
    expect(decimalParaCampo('')).toBe('')
  })
})

describe('csv', () => {
  it('gera CSV com separador ; e escapa aspas', () => {
    const csv = gerarCsv([{ titulo: 'Nome', valor: (r: { n: string }) => r.n }], [{ n: 'Ana "A"' }, { n: 'B;C' }])
    expect(csv).toBe('﻿Nome\r\n"Ana ""A"""\r\n"B;C"')
  })
})
