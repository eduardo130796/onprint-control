import { describe, expect, it } from 'vitest'
import { MAX_DESCRICAO, descricaoLista, descricaoLoja, descricaoProduto, descricaoProdutos, resumirTexto, tituloAba } from './seo'

const loja = { nome: 'Gráfica Horizonte', slogan: 'Impressão rápida', seoDescricao: null }

describe('resumirTexto', () => {
  it('junta as linhas e mantém o texto curto inteiro', () => {
    expect(resumirTexto('  Banner\n\nem   lona ')).toBe('Banner em lona')
    expect(resumirTexto(null)).toBe('')
  })

  it('corta na última palavra inteira com reticências', () => {
    const r = resumirTexto('palavra '.repeat(40))
    expect(r.length).toBeLessThanOrEqual(MAX_DESCRICAO)
    expect(r.endsWith('palavra…')).toBe(true)
    expect(resumirTexto('um dois três quatro', 12)).toBe('um dois…')
  })
})

describe('título da aba', () => {
  it('página · loja; sem página, só a loja', () => {
    expect(tituloAba('Produtos', 'Gráfica Horizonte')).toBe('Produtos · Gráfica Horizonte')
    expect(tituloAba(null, 'Gráfica Horizonte')).toBe('Gráfica Horizonte')
    expect(tituloAba('Produtos', '')).toBe('Produtos')
  })
})

describe('descrições', () => {
  it('loja: descrição SEO, senão slogan, senão texto padrão', () => {
    expect(descricaoLoja({ ...loja, seoDescricao: 'Banners e adesivos em Curitiba' })).toBe('Banners e adesivos em Curitiba')
    expect(descricaoLoja(loja)).toBe('Impressão rápida')
    expect(descricaoLoja({ ...loja, slogan: null })).toContain('Gráfica Horizonte')
  })

  it('produtos, categoria e busca', () => {
    expect(descricaoProdutos(loja, {})).toContain('Todos os produtos da Gráfica Horizonte')
    expect(descricaoProdutos(loja, { categoria: { nome: 'Banners', quantidade: 3 } })).toContain('Banners na Gráfica Horizonte. 3 produtos.')
    expect(descricaoProdutos(loja, { categoria: { nome: 'Banners', quantidade: 1 } })).toContain('1 produto.')
    expect(descricaoProdutos(loja, { busca: 'lona' })).toContain('“lona”')
  })

  it('produto: nome, preço e começo do texto, no limite', () => {
    expect(descricaoProduto({ nome: 'Banner', preco: 'R$ 45,00 / m²', texto: 'Lona 440g resistente.', loja: 'X' })).toBe('Banner — R$ 45,00 / m². Lona 440g resistente.')
    expect(descricaoProduto({ nome: 'Banner', preco: 'Sob consulta', texto: null, loja: 'Gráfica Horizonte' })).toBe('Banner — Sob consulta. Peça seu orçamento na Gráfica Horizonte.')
    expect(descricaoProduto({ nome: 'Banner', preco: 'R$ 1,00', texto: 'texto '.repeat(60), loja: 'X' }).length).toBeLessThanOrEqual(MAX_DESCRICAO)
  })

  it('lista', () => {
    expect(descricaoLista(loja)).toContain('Gráfica Horizonte')
  })
})
