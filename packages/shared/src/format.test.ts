import { describe, expect, it } from 'vitest'
import {
  formatarCep,
  formatarDataSimples,
  formatarCpfCnpj,
  formatarData,
  formatarMoeda,
  formatarTelefone,
  iniciais,
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
