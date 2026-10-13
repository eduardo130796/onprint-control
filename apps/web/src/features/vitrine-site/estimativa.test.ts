import { describe, expect, it } from 'vitest'
import type { PrecoVitrine } from '@onprint/shared'
import { calcularEstimativa, somarEstimativas, textoEstimativa } from './estimativa'

const m2: PrecoVitrine = { modo: 'a_partir_de', valor: '65.00', unidade: 'm²' }

describe('estimativa do valor', () => {
  it('m²: preço × largura × altura × peças', () => {
    expect(calcularEstimativa({ preco: m2, modoCalculo: 'm2', quantidade: 2, largura: '1.5', altura: '0.8' })).toBe(156)
    expect(calcularEstimativa({ preco: m2, modoCalculo: 'm2', quantidade: 1, largura: 0.333, altura: 1 })).toBe(21.65)
  })

  it('m² sem as duas medidas: sem estimativa', () => {
    expect(calcularEstimativa({ preco: m2, modoCalculo: 'm2', quantidade: 1, largura: '1.5', altura: null })).toBeNull()
    expect(calcularEstimativa({ preco: m2, modoCalculo: 'm2', quantidade: 1, largura: '', altura: '1' })).toBeNull()
  })

  it('metro linear: só o comprimento conta', () => {
    expect(calcularEstimativa({ preco: { modo: 'fixo', valor: '12', unidade: 'metro' }, modoCalculo: 'metro_linear', quantidade: 3, largura: '2.5', altura: '0.5' })).toBe(90)
  })

  it('unidade e milheiro (quantidade em unidades)', () => {
    expect(calcularEstimativa({ preco: { modo: 'fixo', valor: '35', unidade: 'unidade' }, modoCalculo: 'unidade', quantidade: 10 })).toBe(350)
    expect(calcularEstimativa({ preco: { modo: 'fixo', valor: '120', unidade: 'milheiro' }, modoCalculo: 'milheiro', quantidade: 2500 })).toBe(300)
  })

  it('sob consulta, por hora, sem valor ou quantidade inválida: sem estimativa', () => {
    expect(calcularEstimativa({ preco: { modo: 'sob_consulta', valor: null, unidade: 'm²' }, modoCalculo: 'm2', quantidade: 1, largura: 1, altura: 1 })).toBeNull()
    expect(calcularEstimativa({ preco: { modo: 'fixo', valor: '80', unidade: 'hora' }, modoCalculo: 'hora', quantidade: 2 })).toBeNull()
    expect(calcularEstimativa({ preco: { modo: 'fixo', valor: '0', unidade: 'unidade' }, modoCalculo: 'unidade', quantidade: 2 })).toBeNull()
    expect(calcularEstimativa({ preco: { modo: 'fixo', valor: '10', unidade: 'unidade' }, modoCalculo: 'unidade', quantidade: 0 })).toBeNull()
    expect(calcularEstimativa({ preco: { modo: 'fixo', valor: '10', unidade: 'unidade' }, modoCalculo: 'unidade', quantidade: NaN })).toBeNull()
  })

  it('texto: "a partir de" e acabamentos sem preço', () => {
    expect(textoEstimativa(156, { aPartirDe: false, comAcabamentos: false })).toBe('Estimativa: R$ 156,00')
    expect(textoEstimativa(1234.5, { aPartirDe: true, comAcabamentos: true })).toBe('Estimativa: a partir de R$ 1.234,50 + acabamentos')
  })

  it('total da lista só com todos os itens estimados', () => {
    expect(somarEstimativas([156, 350.1])).toBe(506.1)
    expect(somarEstimativas([156, null])).toBeNull()
    expect(somarEstimativas([])).toBeNull()
  })
})
