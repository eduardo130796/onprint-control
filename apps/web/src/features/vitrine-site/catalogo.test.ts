import { describe, expect, it } from 'vitest'
import type { ProdutoCardVitrine } from '@onprint/shared'
import { capasDasCategorias, lerOrdem, ordenarProdutos } from './catalogo'

const produto = (slug: string, valor: string | null, extra: Partial<ProdutoCardVitrine> = {}): ProdutoCardVitrine => ({
  slug,
  nome: slug,
  categoria: null,
  capaUrl: null,
  preco: { modo: valor === null ? 'sob_consulta' : 'fixo', valor, unidade: 'unidade' },
  prazoDias: 0,
  destaque: false,
  ...extra,
})

describe('capa das categorias', () => {
  it('primeiro produto com foto de cada categoria', () => {
    const a = { id: 'a', nome: 'A' }
    const b = { id: 'b', nome: 'B' }
    const capas = capasDasCategorias([
      produto('sem-foto', '1', { categoria: a }),
      produto('a1', '1', { categoria: a, capaUrl: '/a1' }),
      produto('a2', '1', { categoria: a, capaUrl: '/a2' }),
      produto('sem-categoria', '1', { capaUrl: '/x' }),
      produto('b1', '1', { categoria: b, capaUrl: '/b1' }),
    ])
    expect(Object.fromEntries(capas)).toEqual({ a: '/a1', b: '/b1' })
  })
})

describe('ordem dos produtos', () => {
  const lista = [produto('caneca', '35'), produto('placa', null), produto('adesivo', '70'), produto('banner', '12.5')]

  it('padrão mantém a ordem da gráfica (e valor desconhecido também)', () => {
    expect(ordenarProdutos(lista, 'padrao')).toBe(lista)
    expect(lerOrdem('qualquer')).toBe('padrao')
    expect(lerOrdem('menor-preco')).toBe('menor-preco')
  })

  it('preço: sob consulta sempre no fim', () => {
    expect(ordenarProdutos(lista, 'menor-preco').map((p) => p.slug)).toEqual(['banner', 'caneca', 'adesivo', 'placa'])
    expect(ordenarProdutos(lista, 'maior-preco').map((p) => p.slug)).toEqual(['adesivo', 'caneca', 'banner', 'placa'])
  })

  it('nome em ordem alfabética, sem mexer na lista original', () => {
    expect(ordenarProdutos(lista, 'nome').map((p) => p.slug)).toEqual(['adesivo', 'banner', 'caneca', 'placa'])
    expect(lista[0]!.slug).toBe('caneca')
  })
})
