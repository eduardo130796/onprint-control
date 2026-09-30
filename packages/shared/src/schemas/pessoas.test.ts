import { describe, expect, it } from 'vitest'
import { clienteSchema, fornecedorSchema } from './pessoas'

describe('clienteSchema', () => {
  it('aceita pré-cadastro mínimo e normaliza campos', () => {
    const r = clienteSchema.parse({ nome: ' Ana ', whatsapp: '(11) 98765-4321', email: '', cpfCnpj: '' })
    expect(r).toMatchObject({ nome: 'Ana', whatsapp: '11987654321', email: null, cpfCnpj: null })
    expect(r.situacao).toBe('pre_cadastro')
    expect(r.limiteCredito).toBe('0')
  })

  it('exige ao menos um contato', () => {
    const r = clienteSchema.safeParse({ nome: 'Ana' })
    expect(r.success).toBe(false)
  })

  it('rejeita CPF inválido e CNPJ em pessoa física', () => {
    expect(clienteSchema.safeParse({ nome: 'Ana', whatsapp: '11987654321', cpfCnpj: '111.111.111-11' }).success).toBe(false)
    expect(
      clienteSchema.safeParse({ nome: 'Ana', whatsapp: '11987654321', tipoPessoa: 'PF', cpfCnpj: '11.222.333/0001-81' })
        .success,
    ).toBe(false)
  })

  it('aceita limite de crédito no formato brasileiro ou da API', () => {
    expect(clienteSchema.parse({ nome: 'Ana', email: 'a@b.com', limiteCredito: '1.500,50' }).limiteCredito).toBe('1500.50')
    expect(clienteSchema.parse({ nome: 'Ana', email: 'a@b.com', limiteCredito: '1500.5' }).limiteCredito).toBe('1500.5')
    expect(clienteSchema.safeParse({ nome: 'Ana', email: 'a@b.com', limiteCredito: '1.500.50' }).success).toBe(false)
  })
})

describe('fornecedorSchema', () => {
  it('aceita fornecedor PJ com CNPJ válido e UF em minúsculas', () => {
    const r = fornecedorSchema.parse({ nome: 'Lonas SA', cpfCnpj: '11222333000181', uf: 'sp', prazoMedioDias: '15' })
    expect(r.uf).toBe('SP')
    expect(r.prazoMedioDias).toBe(15)
  })
})
