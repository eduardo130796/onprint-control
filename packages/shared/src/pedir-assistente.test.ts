import { describe, expect, it } from 'vitest'
import { entradaEstoqueSchema } from './schemas/estoque'
import { documentoDoTexto, pedirAssistenteSchema } from './pedir-assistente'

describe('Peça ao Assistente', () => {
  it('documento do texto: só CPF/CNPJ válido, sem pontuação', () => {
    expect(documentoDoTexto('cadastrar cliente 11.222.333/0001-81')).toBe('11222333000181')
    expect(documentoDoTexto('CPF 123.456.789-09 da Ana')).toBe('12345678909')
    // Dígito errado ou telefone não é documento
    expect(documentoDoTexto('CNPJ 11.222.333/0001-82')).toBeNull()
    expect(documentoDoTexto('zap (11) 98888-7777')).toBeNull()
  })

  it('caixa: texto obrigatório e com limite', () => {
    expect(pedirAssistenteSchema.safeParse({ texto: ' ' }).success).toBe(false)
    expect(pedirAssistenteSchema.parse({ texto: ' quem está devendo? ' }).texto).toBe('quem está devendo?')
  })

  it('entrada de estoque aceita a memória dos códigos do fornecedor (opcional)', () => {
    const base = { localId: '00000000-0000-4000-8000-000000000001', dataEntrada: '2026-10-25', itens: [{ produtoId: '00000000-0000-4000-8000-000000000002', quantidade: '2', custoUnitario: '10' }] }
    expect(entradaEstoqueSchema.parse(base).memoria).toBeUndefined()
    const r = entradaEstoqueSchema.parse({ ...base, memoria: [{ codigo: 'LF-440', produtoId: '00000000-0000-4000-8000-000000000002' }] })
    expect(r.memoria).toEqual([{ codigo: 'LF-440', produtoId: '00000000-0000-4000-8000-000000000002', emEmbalagem: false }])
  })
})
