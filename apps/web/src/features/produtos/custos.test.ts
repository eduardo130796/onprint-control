import { describe, expect, it } from 'vitest'
import { agruparLinhasCusto, converterEmbalagem, minutosAutomaticos, paraApi, paraCampo, producaoParaMotor, textoSituacao, usoDaUnidade } from './custos'

describe('custos (tela)', () => {
  it('reconhece a unidade de uso pela sigla', () => {
    expect(usoDaUnidade('m²')).toBe('m2')
    expect(usoDaUnidade('M2')).toBe('m2')
    expect(usoDaUnidade('m')).toBe('m')
    expect(usoDaUnidade('ml')).toBe('m')
    expect(usoDaUnidade('un')).toBe('outra')
    expect(usoDaUnidade('folha')).toBe('outra')
    expect(usoDaUnidade(null)).toBe('outra')
  })

  it('converte entre o campo e a API', () => {
    expect(paraApi('1.234,56')).toBe('1234.56')
    expect(paraApi('3,2')).toBe('3.2')
    expect(paraApi('')).toBe('')
    expect(paraCampo('3.200')).toBe('3,2')
    expect(paraCampo('9.0625')).toBe('9,0625')
    expect(paraCampo(null)).toBe('')
  })

  it('converte embalagens em unidade de uso (2 rolos de 160 m²)', () => {
    expect(converterEmbalagem('2', '1.450,00', 160)).toEqual({ quantidade: '320', custoUnitario: '9.0625' })
    expect(converterEmbalagem('1,5', '30,00', 1000)).toEqual({ quantidade: '1500', custoUnitario: '0.03' })
    expect(converterEmbalagem('2', '10', 0)).toBeNull()
  })

  it('aplica a regra dos minutos vazios da produção', () => {
    const dados = { nome: 'Impressão', custoHora: '60', velocidadeM2Hora: '20', tempoPadraoMinutos: 10 }
    expect(producaoParaMotor({ minutos: '', base: 'por_m2', setupMinutos: '' }, dados)).toMatchObject({ minutos: '0', base: 'por_m2', setupMinutos: '0' })
    expect(producaoParaMotor({ minutos: '', base: 'por_unidade', setupMinutos: '5' }, dados)).toMatchObject({ minutos: '10', base: 'por_item', setupMinutos: '5' })
    expect(producaoParaMotor({ minutos: '2,5', base: 'por_unidade', setupMinutos: '' }, dados)).toMatchObject({ minutos: '2.5', base: 'por_unidade' })
    expect(minutosAutomaticos('por_m2', dados)).toBe('auto 3')
  })

  it('descreve o semáforo do lucro', () => {
    expect(textoSituacao('ok', '31.0')).toBe('Lucro de 31%')
    expect(textoSituacao('prejuizo', '-4.5')).toBe('Prejuízo de 4,5%')
    expect(textoSituacao('sem_custo', '0')).toBe('Informe o custo')
  })
})

describe('composição do custo (orçamento/pedido)', () => {
  it('agrupa as linhas na ordem fixa e soma em centavos', () => {
    const g = agruparLinhasCusto([
      { grupo: 'acabamento', nome: 'Ilhós: Ilhós latão', quantidade: '8.000', unidade: 'un', valor: '0.80' },
      { grupo: 'material', nome: 'Lona', quantidade: '1.100', unidade: 'm²', valor: '9.97' },
      { grupo: 'producao', nome: 'Impressão', quantidade: '6.0', unidade: 'min', valor: '3.00' },
      { grupo: 'extra', nome: 'Embalagem', quantidade: '1.000', unidade: '', valor: '0.10' },
      { grupo: 'rateio', nome: 'Custos fixos', quantidade: '6.0', unidade: 'min', valor: '0.20' },
      { grupo: 'produto', nome: 'Custo do produto', quantidade: '1.000', unidade: '', valor: '1.00' },
    ])
    expect(g.map((x) => [x.grupo, x.valor, x.linhas.length])).toEqual([
      ['materiais', '10.97', 2],
      ['producao', '3.00', 1],
      ['acabamentos', '0.80', 1],
      ['outros', '0.30', 2],
    ])
    expect(agruparLinhasCusto(undefined)).toEqual([])
  })
})
