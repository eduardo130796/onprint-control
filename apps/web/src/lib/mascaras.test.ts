import { describe, expect, it } from 'vitest'
import { decimalParaInput, mascaraCep, mascaraCpfCnpj, mascaraMoeda, mascaraTelefone } from './mascaras'
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
})

describe('csv', () => {
  it('gera CSV com separador ; e escapa aspas', () => {
    const csv = gerarCsv([{ titulo: 'Nome', valor: (r: { n: string }) => r.n }], [{ n: 'Ana "A"' }, { n: 'B;C' }])
    expect(csv).toBe('﻿Nome\r\n"Ana ""A"""\r\n"B;C"')
  })
})
