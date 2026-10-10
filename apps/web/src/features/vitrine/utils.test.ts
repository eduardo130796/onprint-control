import { describe, expect, it } from 'vitest'
import { formatarMoeda, type ProdutoVitrineResumo } from '@onprint/shared'
import { dadosVitrine, precoExibido, semProtocolo, sugerirSlug } from './utils'

const produto: ProdutoVitrineResumo = {
  id: 'p1',
  codigo: 'PRD-0001',
  nome: 'Banner em lona',
  categoria: null,
  modoCalculo: 'm2',
  precoVenda: '45.00',
  ativo: true,
  publicado: false,
  destaque: false,
  nomePublico: null,
  descricaoPublica: null,
  modoPreco: 'fixo',
  slug: 'banner-em-lona',
  ordem: 3,
  imagens: [],
}

describe('vitrine', () => {
  it('mostra o preço como o site: fixo, a partir de e sob consulta', () => {
    expect(precoExibido(produto)).toBe(`${formatarMoeda('45.00')} / m²`)
    expect(precoExibido({ ...produto, modoPreco: 'a_partir_de', modoCalculo: 'metro_linear' })).toBe(`a partir de ${formatarMoeda('45.00')} / metro`)
    expect(precoExibido({ ...produto, modoPreco: 'sob_consulta' })).toBe('Sob consulta')
  })

  it('monta o PATCH completo com a mudança de um interruptor', () => {
    expect(dadosVitrine(produto, { publicado: true })).toEqual({
      publicado: true,
      destaque: false,
      nomePublico: null,
      descricaoPublica: null,
      modoPreco: 'fixo',
      slug: 'banner-em-lona',
      ordem: 3,
    })
  })

  it('exibe o endereço sem protocolo', () => {
    expect(semProtocolo('https://grafica.grafygo.com.br/')).toBe('grafica.grafygo.com.br')
    expect(semProtocolo('http://grafica.localhost:5173')).toBe('grafica.localhost:5173')
  })

  it('sugere o endereço do produto como a API gera (sem acento, minúsculo, hífen)', () => {
    expect(sugerirSlug('Cartão de Visita 4x4 — Couché')).toBe('cartao-de-visita-4x4-couche')
    expect(sugerirSlug('  Banner!! ')).toBe('banner')
  })
})
