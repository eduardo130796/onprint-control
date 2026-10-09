import { describe, expect, it } from 'vitest'
import { embalagemDoInsumo, valoresDaLinha } from './embalagem'

const rolo = {
  embalagem: 'rolo' as const,
  embalagemLargura: '3.2',
  embalagemComprimento: '50',
  embalagemConteudo: null,
  precoEmbalagem: '1450.00',
  unidadeMedida: { id: 'u', sigla: 'm²', nome: 'Metro quadrado' },
}

describe('entrada em embalagens', () => {
  it('descobre quantas unidades de uso vêm na embalagem', () => {
    expect(embalagemDoInsumo(rolo)).toEqual({ tipo: 'rolo', fator: 160, sigla: 'm²', precoEmbalagem: '1450.00' })
    expect(embalagemDoInsumo({ ...rolo, embalagem: 'unidade' })).toBeNull()
    expect(embalagemDoInsumo({ ...rolo, embalagem: 'pacote', embalagemConteudo: null, unidadeMedida: { id: 'u', sigla: 'un', nome: 'Unidade' } })).toBeNull()
  })

  it('converte 2 rolos de 160 m² para 320 m² ao custo por m²', () => {
    const embalagem = embalagemDoInsumo(rolo)
    const linha = { porEmbalagem: true, embalagem, embalagens: '2', precoEmbalagem: '1.450,00', quantidade: '', custoUnitario: '' }
    expect(valoresDaLinha(linha)).toEqual({ quantidade: '320', custoUnitario: '9.0625' })
    // Na unidade de uso, vale o que foi digitado
    expect(valoresDaLinha({ ...linha, porEmbalagem: false, quantidade: '10', custoUnitario: '9,5' })).toEqual({ quantidade: '10', custoUnitario: '9,5' })
    // Sem preço ainda: só a quantidade
    expect(valoresDaLinha({ ...linha, precoEmbalagem: '' })).toEqual({ quantidade: '320', custoUnitario: '' })
  })
})
