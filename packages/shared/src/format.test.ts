import { describe, expect, it } from 'vitest'
import {
  formatarCep,
  formatarDataSimples,
  formatarCpfCnpj,
  formatarData,
  formatarMoeda,
  formatarTelefone,
  iniciais,
  nomeCliente,
  nomeParaSaudacao,
} from './format'

describe('format', () => {
  it('formata moeda em BRL a partir de número ou string decimal', () => {
    expect(formatarMoeda(1234.56)).toBe('R$ 1.234,56')
    expect(formatarMoeda('1234.50')).toBe('R$ 1.234,50')
  })

  it('formata data em dd/mm/aaaa no fuso de São Paulo', () => {
    // 02:00 UTC ainda é o dia anterior em São Paulo (UTC-3)
    expect(formatarData('2026-03-10T02:00:00Z')).toBe('09/03/2026')
    expect(formatarData(null)).toBe('—')
    // Datas puras (vencimento, pagamento) não mudam de dia com o fuso
    expect(formatarData('2026-10-11T00:00:00.000Z')).toBe('11/10/2026')
    expect(formatarData('2026-10-11')).toBe('11/10/2026')
    expect(formatarData(new Date('2026-10-11T00:00:00Z'))).toBe('11/10/2026')
    expect(formatarData('2026-10-11T00:00:00.123Z')).toBe('10/10/2026')
  })

  it('formata documentos, telefone e CEP', () => {
    expect(formatarCpfCnpj('12345678901')).toBe('123.456.789-01')
    expect(formatarCpfCnpj('12345678000195')).toBe('12.345.678/0001-95')
    expect(formatarTelefone('11987654321')).toBe('(11) 98765-4321')
    expect(formatarCep('01310100')).toBe('01310-100')
  })

  it('gera iniciais', () => {
    expect(iniciais('Maria da Silva')).toBe('MD')
  })
})

describe('formatarDataSimples', () => {
  it('não desloca o dia pelo fuso', () => {
    expect(formatarDataSimples('2026-10-06T00:00:00.000Z')).toBe('06/10/2026')
    expect(formatarDataSimples('2026-10-06')).toBe('06/10/2026')
  })
})

describe('nomeParaSaudacao', () => {
  it('pessoa: primeiro nome', () => {
    expect(nomeParaSaudacao('Maria da Silva')).toBe('Maria')
    expect(nomeParaSaudacao('  João  ')).toBe('João')
    expect(nomeParaSaudacao('Fernanda Lima', '123.456.789-09')).toBe('Fernanda')
  })
  it('empresa: nome sem o sufixo jurídico', () => {
    expect(nomeParaSaudacao('Pet Feliz Banho e Tosa Ltda')).toBe('Pet Feliz Banho e Tosa')
    expect(nomeParaSaudacao('Padaria Pão Quente - ME')).toBe('Padaria Pão Quente')
    expect(nomeParaSaudacao('Construtora Alfa S/A')).toBe('Construtora Alfa')
    expect(nomeParaSaudacao('Mercado Bom Preço', '12.345.678/0001-90')).toBe('Mercado Bom Preço')
    expect(nomeParaSaudacao('Ltda')).toBe('Ltda')
  })
})

describe('nomeCliente', () => {
  it('prefere o nome fantasia', () => {
    expect(nomeCliente({ nome: 'Pet Feliz Comércio de Rações Ltda', fantasia: 'Pet Feliz' })).toBe('Pet Feliz')
    expect(nomeCliente({ nome: 'José Carlos Souza', fantasia: '  Zé da Banca ' })).toBe('Zé da Banca')
  })
  it('sem fantasia, usa o nome / razão social', () => {
    expect(nomeCliente({ nome: 'Maria da Silva', fantasia: null })).toBe('Maria da Silva')
    expect(nomeCliente({ nome: 'Maria da Silva', fantasia: '   ' })).toBe('Maria da Silva')
    expect(nomeCliente({ nome: 'Maria da Silva' })).toBe('Maria da Silva')
  })
  it('a saudação usa o nome de exibição', () => {
    const pet = { nome: 'Comércio de Rações Silva Ltda', fantasia: 'Pet Feliz' }
    expect(nomeParaSaudacao(nomeCliente(pet), '12.345.678/0001-90')).toBe('Pet Feliz')
  })
})
