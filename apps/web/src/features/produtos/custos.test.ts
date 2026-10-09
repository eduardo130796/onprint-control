import { describe, expect, it } from 'vitest'
import { converterEmbalagem, minutosAutomaticos, paraApi, paraCampo, producaoParaMotor, textoSituacao, usoDaUnidade } from './custos'

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
