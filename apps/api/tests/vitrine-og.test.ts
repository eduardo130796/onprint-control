import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DiscoLocalStorage } from '../src/core/storage'
import {
  ROBOS_PREVIA,
  caminhoDaPagina,
  escaparHtml,
  htmlOgGenerico,
  montarHtmlOg,
  origemDoHost,
  paginaDoCaminho,
  resumir,
  textoPrazoOg,
  textoPrecoOg,
  type DadosOg,
} from '../src/modules/vitrine/og'

const UUID = '2656637c-1c87-4ed3-a3d5-4ecb78327366'

/** Conteúdo de uma meta tag (property ou name) */
const tag = (html: string, nome: string) => new RegExp(`<meta (?:property|name)="${nome.replace(/[:.]/g, '\\$&')}" content="([^"]*)">`).exec(html)?.[1] ?? null

const produto: DadosOg = {
  titulo: 'Banner em lona 440 g',
  tituloAba: 'Banner em lona 440 g | Gráfica Exemplo',
  descricao: 'A partir de R$ 65,00 / m² · Pronto em até 3 dias',
  url: 'https://grafica.grafygo.com.br/produto/banner-em-lona-440-g',
  siteNome: 'Gráfica Exemplo',
  imagem: { url: 'https://grafica.grafygo.com.br/api/v1/publico/grafica/vitrine/imagens/x?w=1200&f=jpg', largura: 1200, altura: 675 },
}

describe('prévia do link: leitores de link', () => {
  it('reconhece WhatsApp, Facebook, Telegram… e deixa buscadores e navegadores de fora', () => {
    for (const ua of ['WhatsApp/2.23.20.0 A', 'facebookexternalhit/1.1', 'Twitterbot/1.0', 'TelegramBot (like TwitterBot)', 'Mozilla/5.0 (compatible; Discordbot/2.0)', 'LinkedInBot/1.0', 'Slackbot-LinkExpanding 1.0', 'Pinterestbot', 'SkypeUriPreview Preview/0.5', 'whatsapp/2'])
      expect(ROBOS_PREVIA.test(ua), ua).toBe(true)
    for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1)', 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', 'curl/8.0'])
      expect(ROBOS_PREVIA.test(ua), ua).toBe(false)
  })
})

describe('prévia do link: página pelo caminho', () => {
  it('produto, categoria e o resto vira início', () => {
    expect(paginaDoCaminho('/produto/banner-em-lona-440-g')).toEqual({ tipo: 'produto', slug: 'banner-em-lona-440-g' })
    expect(paginaDoCaminho('/produto/banner?utm_source=zap#x')).toEqual({ tipo: 'produto', slug: 'banner' })
    expect(paginaDoCaminho('/produto/banner/')).toEqual({ tipo: 'produto', slug: 'banner' })
    expect(paginaDoCaminho(`/categoria/${UUID.toUpperCase()}`)).toEqual({ tipo: 'categoria', id: UUID })
    for (const c of ['/', '', '/produtos', '/lista', '/categoria/abc', '/produto/Com Espaço', '/produto/a/b', '/produto/<script>', '/qualquer'])
      expect(paginaDoCaminho(c), c).toEqual({ tipo: 'inicio' })
  })
  it('caminho canônico', () => {
    expect(caminhoDaPagina({ tipo: 'inicio' })).toBe('/')
    expect(caminhoDaPagina({ tipo: 'produto', slug: 'x' })).toBe('/produto/x')
    expect(caminhoDaPagina({ tipo: 'categoria', id: UUID })).toBe(`/categoria/${UUID}`)
  })
})

describe('prévia do link: endereço absoluto', () => {
  it('esquema pelo X-Forwarded-Proto; sem ele, http', () => {
    expect(origemDoHost('grafica.grafygo.com.br', 'https')).toBe('https://grafica.grafygo.com.br')
    expect(origemDoHost('Grafica.Localhost:5173', undefined)).toBe('http://grafica.localhost:5173')
    expect(origemDoHost('grafica.grafygo.com.br', 'https, http')).toBe('https://grafica.grafygo.com.br')
    expect(origemDoHost('grafica.grafygo.com.br', 'javascript')).toBe('http://grafica.grafygo.com.br')
  })
  it('host estranho é recusado', () => {
    for (const h of ['', 'a b.com', 'x.com/caminho', 'x.com"><script>', 'user@x.com']) expect(origemDoHost(h, 'https'), h).toBeNull()
  })
})

describe('prévia do link: textos', () => {
  it('preço e prazo iguais ao site', () => {
    expect(textoPrecoOg({ modo: 'a_partir_de', valor: '65.00', unidade: 'm²' })).toBe('A partir de R$ 65,00 / m²')
    expect(textoPrecoOg({ modo: 'fixo', valor: '70.00', unidade: 'unidade' })).toBe('R$ 70,00 / unidade')
    expect(textoPrecoOg({ modo: 'sob_consulta', valor: null, unidade: 'm²' })).toBe('Sob consulta')
    expect(textoPrecoOg({ modo: 'fixo', valor: '0', unidade: 'm²' })).toBe('Sob consulta')
    expect(textoPrazoOg(0)).toBeNull()
    expect(textoPrazoOg(1)).toBe('Pronto em 1 dia')
    expect(textoPrazoOg(5)).toBe('Pronto em até 5 dias')
  })
  it('resume em uma linha com reticências', () => {
    expect(resumir('  a\n\n b  ')).toBe('a b')
    const r = resumir('x'.repeat(300))
    expect(r.length).toBe(200)
    expect(r.endsWith('…')).toBe(true)
  })
  it('escapa HTML', () => {
    expect(escaparHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;')
  })
})

describe('prévia do link: HTML', () => {
  it('página de produto: tags og e twitter com imagem grande', () => {
    const html = montarHtmlOg(produto)
    expect(html).toContain('<title>Banner em lona 440 g | Gráfica Exemplo</title>')
    expect(tag(html, 'og:title')).toBe('Banner em lona 440 g')
    expect(tag(html, 'og:description')).toBe('A partir de R$ 65,00 / m² · Pronto em até 3 dias')
    expect(tag(html, 'og:url')).toBe(produto.url)
    expect(tag(html, 'og:site_name')).toBe('Gráfica Exemplo')
    expect(tag(html, 'og:type')).toBe('website')
    expect(tag(html, 'og:image')).toBe('https://grafica.grafygo.com.br/api/v1/publico/grafica/vitrine/imagens/x?w=1200&amp;f=jpg')
    expect(tag(html, 'og:image:type')).toBe('image/jpeg')
    expect(`${tag(html, 'og:image:width')}x${tag(html, 'og:image:height')}`).toBe('1200x675')
    expect(tag(html, 'twitter:card')).toBe('summary_large_image')
    expect(tag(html, 'twitter:image')).toBe(tag(html, 'og:image'))
    expect(html).toContain(`<a href="${produto.url}">`)
    expect(html).not.toMatch(/http-equiv|<script/i)
  })
  it('sem imagem: card simples e sem og:image; sem tamanho conhecido, sem width/height', () => {
    const html = montarHtmlOg({ ...produto, descricao: null, imagem: null })
    expect(tag(html, 'og:image')).toBeNull()
    expect(tag(html, 'og:description')).toBeNull()
    expect(tag(html, 'twitter:card')).toBe('summary')
    const semTamanho = montarHtmlOg({ ...produto, imagem: { url: 'https://x/i.jpg', largura: null, altura: null } })
    expect(tag(semTamanho, 'og:image')).toBe('https://x/i.jpg')
    expect(tag(semTamanho, 'og:image:width')).toBeNull()
  })
  it('escapa tudo o que vem da gráfica', () => {
    const html = montarHtmlOg({ ...produto, titulo: 'Placa "VIP" <b>&</b>', tituloAba: '</title><script>alert(1)</script>', siteNome: "D'Ávila", descricao: '"><img src=x onerror=alert(1)>' })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).toContain('<title>&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>')
    expect(tag(html, 'og:title')).toBe('Placa &quot;VIP&quot; &lt;b&gt;&amp;&lt;/b&gt;')
    expect(tag(html, 'og:site_name')).toBe('D&#39;Ávila')
    expect(html).toContain('<h1>Placa &quot;VIP&quot; &lt;b&gt;&amp;&lt;/b&gt;</h1>')
  })
  it('vitrine fora do ar: HTML genérico, sem dados da empresa', () => {
    const html = htmlOgGenerico()
    expect(tag(html, 'og:title')).toBe('Site não encontrado')
    expect(tag(html, 'og:image')).toBeNull()
    expect(tag(html, 'og:site_name')).toBeNull()
  })
})

describe('imagens da vitrine: cache em disco', () => {
  it('remover o original apaga também as versões WebP e JPEG', async () => {
    const raiz = await mkdtemp(join(tmpdir(), 'vitrine-og-'))
    const storage = new DiscoLocalStorage(raiz, 'segredo', 'http://x')
    const caminho = 'pasta/foto.png'
    await mkdir(join(raiz, 'pasta'))
    await writeFile(join(raiz, caminho), 'original')
    for (const sufixo of ['.w480.webp', '.w1200.webp', '.w480.jpg', '.w1200.jpg']) await storage.gravarDerivado(caminho, sufixo, Buffer.from('b'))
    expect((await readdir(join(raiz, 'pasta'))).length).toBe(5)
    expect((await storage.lerDerivado(caminho, '.w1200.jpg'))?.toString()).toBe('b')
    await storage.remover(caminho)
    expect(await readdir(join(raiz, 'pasta'))).toEqual([])
  })
})
