import { formatarMoeda, type PrecoVitrine } from '@onprint/shared'

/**
 * Prévia do link da vitrine (Open Graph, docs/VITRINE.md, Etapa 1.5 A): HTML mínimo para os leitores de link
 * (WhatsApp, Facebook, Telegram…). Funções puras, testadas em tests/vitrine-og.test.ts.
 */

/** Leitores de link que recebem a prévia. Buscadores (Googlebot etc.) não entram: veem o site normal. */
export const ROBOS_PREVIA = /WhatsApp|facebookexternalhit|Facebot|Twitterbot|TelegramBot|Slackbot|LinkedInBot|Discordbot|Pinterest|SkypeUriPreview/i

export type PaginaOg = { tipo: 'inicio' } | { tipo: 'produto'; slug: string } | { tipo: 'categoria'; id: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** "/produto/banner?x=1" → produto "banner"; "/categoria/{uuid}" → categoria; o resto → início */
export function paginaDoCaminho(caminho: string): PaginaOg {
  const [tipo, valor, ...resto] = (caminho.split(/[?#]/)[0] ?? '').split('/').filter(Boolean)
  if (!valor || resto.length) return { tipo: 'inicio' }
  if (tipo === 'produto' && /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(valor)) return { tipo: 'produto', slug: valor }
  if (tipo === 'categoria' && UUID.test(valor)) return { tipo: 'categoria', id: valor.toLowerCase() }
  return { tipo: 'inicio' }
}

/** Caminho canônico da página (og:url) */
export function caminhoDaPagina(pagina: PaginaOg): string {
  if (pagina.tipo === 'produto') return `/produto/${pagina.slug}`
  if (pagina.tipo === 'categoria') return `/categoria/${pagina.id}`
  return '/'
}

/**
 * Origem pública da vitrine ("https://grafica.grafygo.com.br", em dev "http://grafica.localhost:5173").
 * Esquema pelo X-Forwarded-Proto (Caddy); sem ele, http. null se o host não tem cara de host.
 */
export function origemDoHost(host: string, protoEncaminhado: string | undefined): string | null {
  const h = host.trim().toLowerCase().replace(/\.$/, '')
  if (!/^[a-z0-9.-]{1,253}(?::\d{1,5})?$/.test(h)) return null
  const proto = (protoEncaminhado ?? '').split(',')[0]?.trim().toLowerCase()
  return `${proto === 'https' ? 'https' : 'http'}://${h}`
}

export function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Uma linha só, sem espaços repetidos, cortada com reticências */
export function resumir(texto: string, max = 200): string {
  const t = texto.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
}

/** "R$ 45,00 / m²", "A partir de R$ 45,00 / m²" ou "Sob consulta" (igual ao site) */
export function textoPrecoOg(preco: PrecoVitrine): string {
  const numero = preco.valor === null ? NaN : Number(preco.valor)
  if (preco.modo === 'sob_consulta' || !Number.isFinite(numero) || numero <= 0) return 'Sob consulta'
  return [preco.modo === 'a_partir_de' ? 'A partir de' : null, formatarMoeda(numero), preco.unidade ? `/ ${preco.unidade}` : null].filter(Boolean).join(' ')
}

/** Prazo de produção (0 = não informado), igual ao site */
export function textoPrazoOg(dias: number): string | null {
  if (!Number.isFinite(dias) || dias <= 0) return null
  return dias === 1 ? 'Pronto em 1 dia' : `Pronto em até ${dias} dias`
}

export interface DadosOg {
  /** og:title (nome do produto, da categoria ou o título do site) */
  titulo: string
  /** <title>: "Produto | Gráfica" */
  tituloAba: string
  descricao: string | null
  /** Endereço absoluto da página */
  url: string
  /** og:site_name */
  siteNome: string
  imagem: { url: string; largura: number | null; altura: number | null } | null
}

const meta = (atributo: 'property' | 'name', nome: string, valor: string) => `<meta ${atributo}="${nome}" content="${escaparHtml(valor)}">`

/** HTML mínimo com as tags og:* e twitter:*; o corpo só tem o título e o link (sem redirecionar). */
export function montarHtmlOg(d: DadosOg): string {
  const descricao = d.descricao ? resumir(d.descricao) : null
  const tags = [
    meta('property', 'og:type', 'website'),
    meta('property', 'og:locale', 'pt_BR'),
    meta('property', 'og:site_name', d.siteNome),
    meta('property', 'og:title', d.titulo),
    descricao ? meta('property', 'og:description', descricao) : null,
    meta('property', 'og:url', d.url),
    d.imagem ? meta('property', 'og:image', d.imagem.url) : null,
    d.imagem ? meta('property', 'og:image:type', 'image/jpeg') : null,
    d.imagem?.largura ? meta('property', 'og:image:width', String(d.imagem.largura)) : null,
    d.imagem?.altura ? meta('property', 'og:image:height', String(d.imagem.altura)) : null,
    d.imagem ? meta('property', 'og:image:alt', d.titulo) : null,
    meta('name', 'twitter:card', d.imagem ? 'summary_large_image' : 'summary'),
    meta('name', 'twitter:title', d.titulo),
    descricao ? meta('name', 'twitter:description', descricao) : null,
    d.imagem ? meta('name', 'twitter:image', d.imagem.url) : null,
    descricao ? meta('name', 'description', descricao) : null,
  ].filter(Boolean)
  return [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escaparHtml(d.tituloAba)}</title>`,
    ...tags,
    `<link rel="canonical" href="${escaparHtml(d.url)}">`,
    '</head>',
    '<body>',
    `<h1>${escaparHtml(d.titulo)}</h1>`,
    descricao ? `<p>${escaparHtml(descricao)}</p>` : null,
    `<p><a href="${escaparHtml(d.url)}">${escaparHtml(d.url)}</a></p>`,
    '</body>',
    '</html>',
    '',
  ]
    .filter((linha) => linha !== null)
    .join('\n')
}

/** Vitrine fora do ar (sem módulo, desligada, empresa bloqueada ou inexistente): nada da empresa. */
export function htmlOgGenerico(): string {
  return [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>Site não encontrado</title>',
    '<meta name="robots" content="noindex">',
    meta('property', 'og:title', 'Site não encontrado'),
    '</head>',
    '<body>',
    '<h1>Site não encontrado</h1>',
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
