import { describe, expect, it } from 'vitest'
import {
  agruparPorCategoria,
  ajustarTexto,
  linkWhatsappEnvio,
  mensagemCatalogo,
  mensagemProduto,
  mensagemVitrine,
  nomeArquivo,
  partesPrecoProduto,
  primeiroNome,
  quebrarLinhas,
  recorteCapa,
  textoCurto,
  textoPrecoProduto,
  trocarSaudacao,
  urlImagemGrande,
  urlProduto,
} from './divulgar'

// Medida simples: cada letra vale 10
const medir = (t: string) => t.length * 10

describe('mensagens', () => {
  it('produto com e sem nome do cliente', () => {
    const link = 'https://horizonte.grafygo.com.br/produto/banner'
    expect(mensagemProduto({ produto: 'Banner em lona', preco: 'A partir de R$ 45,00 / m²', link })).toBe(
      `Olá! Veja o produto *Banner em lona* — a partir de R$ 45,00 / m²: ${link}`,
    )
    expect(mensagemProduto({ nome: 'MARIA DA SILVA', produto: 'Caneca', preco: 'R$ 35,00 / unidade', link })).toBe(`Olá, Maria! Veja o produto *Caneca* — R$ 35,00 / unidade: ${link}`)
    expect(mensagemProduto({ produto: 'Placa', preco: 'Sob consulta', link })).toContain('— preço sob consulta: ')
  })

  it('vitrine e catálogo levam a loja e o link', () => {
    expect(mensagemVitrine({ loja: 'Gráfica X', link: 'https://x' })).toMatch(/^Olá! Conheça a vitrine online da \*Gráfica X\*.*: https:\/\/x$/)
    expect(mensagemCatalogo({ nome: 'joão', loja: 'Gráfica X', link: 'https://x' })).toMatch(/^Olá, João! .*catálogo.*https:\/\/x$/)
  })

  it('primeiro nome', () => {
    expect(primeiroNome('  ana paula  ')).toBe('Ana')
    expect(primeiroNome(null)).toBe('')
  })

  it('troca a saudação mantendo o resto (mesmo editado)', () => {
    expect(trocarSaudacao('Olá! Veja isto: link', 'Carlos Souza')).toBe('Olá, Carlos! Veja isto: link')
    expect(trocarSaudacao('Olá, Carlos! Veja isto', 'Ana')).toBe('Olá, Ana! Veja isto')
    expect(trocarSaudacao('Olá, Carlos! Veja isto', null)).toBe('Olá! Veja isto')
    expect(trocarSaudacao('Oi! texto', 'Bia')).toBe('Olá, Bia! texto')
    expect(trocarSaudacao('Veja isto', 'Bia')).toBe('Olá, Bia! Veja isto')
  })
})

describe('links', () => {
  it('wa.me para o cliente (com 55) ou para qualquer contato', () => {
    expect(linkWhatsappEnvio('(11) 98888-7777', 'Olá! a&b')).toBe('https://wa.me/5511988887777?text=Ol%C3%A1!%20a%26b')
    expect(linkWhatsappEnvio('5511988887777', 'oi')).toBe('https://wa.me/5511988887777?text=oi')
    expect(linkWhatsappEnvio(null, 'oi')).toBe('https://wa.me/?text=oi')
    expect(linkWhatsappEnvio('123', 'oi')).toBe('https://wa.me/?text=oi')
  })

  it('endereço do produto no site', () => {
    expect(urlProduto('https://x.grafygo.com.br/', 'banner')).toBe('https://x.grafygo.com.br/produto/banner')
    expect(urlProduto('http://x.localhost:5173', null)).toBe('http://x.localhost:5173')
  })

  it('miniatura em 1200 px', () => {
    expect(urlImagemGrande('/api/v1/vitrine/miniaturas/abc?w=480')).toBe('/api/v1/vitrine/miniaturas/abc?w=1200')
    expect(urlImagemGrande('/img/abc')).toBe('/img/abc?w=1200')
  })

  it('nome de arquivo', () => {
    expect(nomeArquivo('Banner em lona 440g!')).toBe('banner-em-lona-440g')
    expect(nomeArquivo('***')).toBe('vitrine')
  })
})

describe('preço', () => {
  const base = { precoVenda: '45', modoCalculo: 'm2' as const }
  it('fixo, a partir de e sob consulta', () => {
    expect(textoPrecoProduto({ ...base, modoPreco: 'fixo' })).toBe('R$ 45,00 / m²')
    expect(partesPrecoProduto({ ...base, modoPreco: 'a_partir_de' })).toEqual({ prefixo: 'A partir de', valor: 'R$ 45,00', sufixo: '/ m²' })
    expect(textoPrecoProduto({ ...base, modoPreco: 'sob_consulta' })).toBe('Sob consulta')
    expect(textoPrecoProduto({ ...base, precoVenda: '0', modoPreco: 'fixo' })).toBe('Sob consulta')
  })
})

describe('layout', () => {
  it('quebra em linhas pela largura', () => {
    expect(quebrarLinhas('banner em lona fosca', 100, medir)).toEqual({ linhas: ['banner em', 'lona fosca'], cortado: false })
  })

  it('limita as linhas e põe reticências', () => {
    const r = quebrarLinhas('um dois tres quatro cinco seis', 100, medir, 2)
    expect(r.cortado).toBe(true)
    expect(r.linhas).toHaveLength(2)
    expect(r.linhas[1]!.endsWith('…')).toBe(true)
    expect(medir(r.linhas[1]!)).toBeLessThanOrEqual(100)
  })

  it('palavra maior que a linha é cortada', () => {
    const r = quebrarLinhas('supercalifragilistico', 80, medir)
    expect(r.linhas[0]).toMatch(/…$/)
    expect(medir(r.linhas[0]!)).toBeLessThanOrEqual(80)
  })

  it('ajusta o tamanho da fonte até caber', () => {
    // medida proporcional ao tamanho: letra = tamanho/10
    const m = (t: string, tam: number) => (t.length * tam) / 10
    expect(ajustarTexto('banner em lona', { tamanhos: [100, 50, 20], largura: 100, maxLinhas: 1, medir: m }).tamanho).toBe(50)
    const menor = ajustarTexto('um texto bem comprido mesmo para caber', { tamanhos: [100, 50], largura: 100, maxLinhas: 1, medir: m })
    expect(menor.tamanho).toBe(50)
    expect(menor.linhas[0]).toMatch(/…$/)
  })

  it('recorte de capa (cover) centralizado', () => {
    expect(recorteCapa(2000, 1000, 500, 500)).toEqual({ sx: 500, sy: 0, sw: 1000, sh: 1000 })
    expect(recorteCapa(1000, 2000, 800, 600)).toEqual({ sx: 0, sy: 625, sw: 1000, sh: 750 })
  })

  it('texto curto: primeiro parágrafo, cortado na palavra', () => {
    expect(textoCurto('Linha um\ncontinua.\n\nOutro parágrafo')).toBe('Linha um continua.')
    const t = textoCurto('palavra '.repeat(40), 50)
    expect(t.length).toBeLessThanOrEqual(50)
    expect(t).toMatch(/palavra…$/)
    expect(textoCurto(null)).toBe('')
  })

  it('agrupa por categoria (sem categoria por último)', () => {
    const g = agruparPorCategoria([
      { id: '1', categoria: { id: 'b', nome: 'Placas' } },
      { id: '2', categoria: null },
      { id: '3', categoria: { id: 'a', nome: 'Banners' } },
      { id: '4', categoria: { id: 'b', nome: 'Placas' } },
    ])
    expect(g.map((x) => [x.titulo, x.produtos.map((p) => p.id)])).toEqual([
      ['Banners', ['3']],
      ['Placas', ['1', '4']],
      ['Outros produtos', ['2']],
    ])
  })
})
