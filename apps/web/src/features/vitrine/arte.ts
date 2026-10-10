import QRCode from 'qrcode'
import type { CoresTema } from '@onprint/shared'
import type { PartesPreco } from '@/features/vitrine-site/formato'
import { ajustarTexto, quebrarLinhas, recorteCapa, reticencias } from './divulgar'

// Imagens para divulgar no WhatsApp/Instagram, desenhadas no navegador (canvas): Status 1080×1920 e Post 1080×1080.
// Fundo na cor do tema (degradê), foto do produto, nome, preço, logo/nome da gráfica, "Peça pelo WhatsApp" e o site.

export type FormatoArte = 'status' | 'post'
export const TAMANHO_ARTE: Record<FormatoArte, { largura: number; altura: number; rotulo: string }> = {
  status: { largura: 1080, altura: 1920, rotulo: 'Status' },
  post: { largura: 1080, altura: 1080, rotulo: 'Post' },
}

export interface DadosArte {
  cores: CoresTema
  loja: string
  logo: HTMLImageElement | null
  /** Endereço do site sem protocolo */
  site: string
  /** Produto: foto, nome, categoria e preço. Sem produto, é a arte da loja (QR do site). */
  produto?: { nome: string; categoria: string | null; preco: PartesPreco; foto: HTMLImageElement | null } | null
  /** Arte da loja: título, slogan, QR do site e até 3 fotos de produtos */
  vitrine?: { titulo: string; slogan: string | null; url: string; fotos: HTMLImageElement[] } | null
}

const TITULO = "'Manrope Variable', 'Manrope', 'Inter Variable', system-ui, sans-serif"
const TEXTO = "'Inter Variable', 'Inter', system-ui, sans-serif"
const fonte = (peso: number, tamanho: number, familia = TITULO) => `${peso} ${tamanho}px ${familia}`

/** Garante as fontes do app carregadas antes de desenhar (sem elas o canvas usa a fonte do sistema) */
export async function carregarFontes() {
  if (typeof document === 'undefined' || !document.fonts) return
  await Promise.all([
    document.fonts.load(fonte(800, 80)),
    document.fonts.load(fonte(700, 40)),
    document.fonts.load(fonte(500, 32, TEXTO)),
    document.fonts.load(fonte(700, 32, TEXTO)),
  ]).catch(() => undefined)
}

/** Imagem do mesmo site (foto do produto, logo) como <img> pronto para o canvas; null se falhar */
export async function carregarImagem(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return null
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const objeto = URL.createObjectURL(await resp.blob())
    const img = new Image()
    img.decoding = 'async'
    img.src = objeto
    await img.decode()
    return img
  } catch {
    return null
  }
}

/** QR code do endereço como imagem (escuro sobre branco: lê em qualquer câmera) */
export async function imagemQr(url: string, cor = '#1E2226'): Promise<HTMLImageElement | null> {
  try {
    const dados = await QRCode.toDataURL(url, { margin: 0, width: 720, errorCorrectionLevel: 'M', color: { dark: `${cor}FF`, light: '#FFFFFFFF' } })
    const img = new Image()
    img.src = dados
    await img.decode()
    return img
  } catch {
    return null
  }
}

// ─── Cores ─────────────────────────────────────────────────────────────────

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
/** Mistura com preto (t = 0..1) */
function escurecer(hex: string, t: number) {
  const [r, g, b] = rgb(hex).map((v) => Math.round(v * (1 - t)))
  return `rgb(${r}, ${g}, ${b})`
}
const alfa = (hex: string, a: number) => {
  const [r, g, b] = rgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

// ─── Primitivas ────────────────────────────────────────────────────────────

function caixa(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Fundo: degradê na cor do tema (do tom "escuro" ao quase preto) com luzes suaves */
function desenharFundo(ctx: CanvasRenderingContext2D, w: number, h: number, cores: CoresTema) {
  const base = cores.escuro
  const g = ctx.createLinearGradient(0, 0, w * 0.35, h)
  g.addColorStop(0, escurecer(base, -0.0))
  g.addColorStop(0.55, escurecer(base, 0.32))
  g.addColorStop(1, escurecer(base, 0.62))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // Luzes: um brilho no alto e um tom da cor viva embaixo
  const luz = ctx.createRadialGradient(w * 0.85, h * 0.05, 0, w * 0.85, h * 0.05, w * 0.9)
  luz.addColorStop(0, 'rgba(255,255,255,0.20)')
  luz.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = luz
  ctx.fillRect(0, 0, w, h)
  const viva = ctx.createRadialGradient(w * 0.05, h * 0.98, 0, w * 0.05, h * 0.98, w * 0.95)
  viva.addColorStop(0, alfa(cores.cor, 0.55))
  viva.addColorStop(1, alfa(cores.cor, 0))
  ctx.fillStyle = viva
  ctx.fillRect(0, 0, w, h)

  // Anéis decorativos
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 2
  for (const [cx, cy, raio] of [
    [w * 1.02, h * 0.12, w * 0.32],
    [w * 1.02, h * 0.12, w * 0.46],
    [-w * 0.06, h * 0.9, w * 0.3],
  ] as const) {
    ctx.beginPath()
    ctx.arc(cx, cy, raio, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

/** Logo num selo branco (a logo pode ser escura) + nome da loja ao lado. Devolve a altura usada. */
function desenharMarca(ctx: CanvasRenderingContext2D, d: DadosArte, x: number, y: number, larguraMax: number, altura = 96, comNome = true) {
  let cx = x
  if (d.logo) {
    const proporcao = d.logo.naturalWidth / Math.max(1, d.logo.naturalHeight)
    const larguraLogo = Math.min(altura * 2.6, Math.max(altura, (altura - 24) * proporcao + 24))
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.18)'
    ctx.shadowBlur = 24
    ctx.shadowOffsetY = 6
    ctx.fillStyle = '#FFFFFF'
    caixa(ctx, cx, y, larguraLogo, altura, 26)
    ctx.fill()
    ctx.restore()
    const caber = Math.min((larguraLogo - 24) / d.logo.naturalWidth, (altura - 24) / d.logo.naturalHeight)
    const lw = d.logo.naturalWidth * caber
    const lh = d.logo.naturalHeight * caber
    ctx.drawImage(d.logo, cx + (larguraLogo - lw) / 2, y + (altura - lh) / 2, lw, lh)
    cx += larguraLogo + 26
    if (!comNome) return
  }
  ctx.fillStyle = '#FFFFFF'
  ctx.textBaseline = 'middle'
  const resto = larguraMax - (cx - x)
  const tamanho = altura >= 90 ? 40 : 32
  ctx.font = fonte(800, tamanho)
  const nome = reticencias(d.loja, resto, (t) => ctx.measureText(t).width)
  ctx.fillText(nome, cx, y + altura / 2 - (d.logo ? 0 : 0))
  ctx.textBaseline = 'alphabetic'
}

/** Foto em cartão arredondado com sombra; sem foto, um quadro com a inicial do produto */
function desenharFoto(ctx: CanvasRenderingContext2D, foto: HTMLImageElement | null, x: number, y: number, w: number, h: number, r: number, inicial: string, cores: CoresTema) {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 60
  ctx.shadowOffsetY = 24
  ctx.fillStyle = '#FFFFFF'
  caixa(ctx, x, y, w, h, r)
  ctx.fill()
  ctx.restore()

  ctx.save()
  const borda = Math.max(6, Math.round(Math.min(w, h) * 0.013))
  caixa(ctx, x + borda, y + borda, w - borda * 2, h - borda * 2, r - borda)
  ctx.clip()
  if (foto) {
    const c = recorteCapa(foto.naturalWidth, foto.naturalHeight, w - borda * 2, h - borda * 2)
    ctx.drawImage(foto, c.sx, c.sy, c.sw, c.sh, x + borda, y + borda, w - borda * 2, h - borda * 2)
  } else {
    ctx.fillStyle = cores.suave
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = cores.escuro
    ctx.font = fonte(800, Math.round(h * 0.4))
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(inicial.toUpperCase(), x + w / 2, y + h / 2)
  }
  ctx.restore()
}

/** Ícone de balão do WhatsApp (traço do lucide "message-circle" + telefone) */
function iconeWhatsapp(ctx: CanvasRenderingContext2D, x: number, y: number, tamanho: number, cor: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(tamanho / 24, tamanho / 24)
  ctx.strokeStyle = cor
  ctx.lineWidth = 2.2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(new Path2D('M7.9 20A9 9 0 1 0 4 16.1L2 22Z'))
  ctx.fillStyle = cor
  ctx.fill(
    new Path2D(
      'M9.4 7.6c.2-.4.5-.4.7-.4h.5c.2 0 .4 0 .6.5l.7 1.7c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.2.3-.1.5.2.4.7 1.1 1.4 1.8.9.8 1.7 1.1 2 1.2.2.1.4.1.5-.1l.7-.8c.2-.2.3-.2.5-.1l1.6.8c.2.1.4.2.4.3.1.1.1.7-.2 1.3-.3.6-1.4 1.2-1.9 1.2-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5.1-4.5-.1-.2-1.2-1.6-1.2-3s.8-2.2 1-2.5Z',
    ),
  )
  ctx.restore()
}

/** Ícone de globo (lucide "globe") */
function iconeGlobo(ctx: CanvasRenderingContext2D, x: number, y: number, tamanho: number, cor: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(tamanho / 24, tamanho / 24)
  ctx.strokeStyle = cor
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(12, 12, 10, 0, Math.PI * 2)
  ctx.stroke()
  ctx.stroke(new Path2D('M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20'))
  ctx.stroke(new Path2D('M2 12h20'))
  ctx.restore()
}

/** Botão "Peça pelo WhatsApp" (pílula branca, texto na cor do tema). Devolve a largura. */
function desenharChamada(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  alturaMax: number,
  cores: CoresTema,
  alinhar: 'esquerda' | 'centro' = 'esquerda',
  texto = 'Peça pelo WhatsApp',
  larguraMax = Infinity,
) {
  const medirLargura = (a: number) => {
    ctx.font = fonte(800, Math.round(a * 0.36))
    return ctx.measureText(texto).width + Math.round(a * 0.46) + a * 0.9
  }
  let altura = alturaMax
  while (medirLargura(altura) > larguraMax && altura > 56) altura -= 2
  y += (alturaMax - altura) / 2
  const tamanho = Math.round(altura * 0.36)
  ctx.font = fonte(800, tamanho)
  const icone = Math.round(altura * 0.46)
  const largura = ctx.measureText(texto).width + icone + altura * 0.9
  const x0 = alinhar === 'centro' ? x - largura / 2 : x
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.25)'
  ctx.shadowBlur = 30
  ctx.shadowOffsetY = 10
  ctx.fillStyle = '#FFFFFF'
  caixa(ctx, x0, y, largura, altura, altura / 2)
  ctx.fill()
  ctx.restore()
  const corTexto = cores.escuro
  iconeWhatsapp(ctx, x0 + altura * 0.38, y + (altura - icone) / 2, icone, corTexto)
  ctx.fillStyle = corTexto
  ctx.textBaseline = 'middle'
  ctx.fillText(texto, x0 + altura * 0.38 + icone + altura * 0.16, y + altura / 2 + 1)
  ctx.textBaseline = 'alphabetic'
  return largura
}

/** Linha do site (globo + endereço) */
function desenharSite(ctx: CanvasRenderingContext2D, site: string, x: number, y: number, tamanho: number, larguraMax: number, alinhar: 'esquerda' | 'centro' = 'esquerda') {
  ctx.font = fonte(600, tamanho, TEXTO)
  while (ctx.measureText(site).width > larguraMax - tamanho * 1.1 - 14 && tamanho > 20) {
    tamanho -= 1
    ctx.font = fonte(600, tamanho, TEXTO)
  }
  const icone = Math.round(tamanho * 1.1)
  const texto = reticencias(site, larguraMax - icone - 14, (t) => ctx.measureText(t).width)
  const largura = icone + 14 + ctx.measureText(texto).width
  const x0 = alinhar === 'centro' ? x - largura / 2 : x
  iconeGlobo(ctx, x0, y - icone / 2, icone, 'rgba(255,255,255,0.85)')
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.textBaseline = 'middle'
  ctx.fillText(texto, x0 + icone + 14, y + 1)
  ctx.textBaseline = 'alphabetic'
}

/** Selo pequeno (categoria) */
function desenharSelo(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, tamanho: number, larguraMax: number) {
  ctx.font = fonte(700, tamanho, TEXTO)
  const t = reticencias(texto.toLocaleUpperCase('pt-BR'), larguraMax - tamanho * 1.6, (s) => ctx.measureText(s).width)
  const altura = tamanho * 2.1
  const largura = ctx.measureText(t).width + tamanho * 1.6 + t.length * 2
  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  caixa(ctx, x, y, largura, altura, altura / 2)
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.textBaseline = 'middle'
  // espaçamento entre letras (letterSpacing ainda não existe em todos os navegadores)
  let cx = x + tamanho * 0.8
  for (const letra of t) {
    ctx.fillText(letra, cx, y + altura / 2 + 1)
    cx += ctx.measureText(letra).width + 2
  }
  ctx.textBaseline = 'alphabetic'
  return altura
}

/** Preço: "A partir de" pequeno, valor grande e "/ m²" discreto, na mesma linha de base. Devolve a altura. */
function desenharPreco(ctx: CanvasRenderingContext2D, preco: PartesPreco, x: number, y: number, tamanho: number, larguraMax: number, alinhar: 'esquerda' | 'centro' = 'esquerda', desenhar = true) {
  let topo = y
  if (preco.prefixo && !desenhar) topo += tamanho * 0.36 + 14
  else if (preco.prefixo) {
    ctx.font = fonte(600, Math.round(tamanho * 0.36), TEXTO)
    ctx.fillStyle = 'rgba(255,255,255,0.78)'
    ctx.textAlign = alinhar === 'centro' ? 'center' : 'left'
    ctx.fillText(preco.prefixo, x, topo + tamanho * 0.36)
    ctx.textAlign = 'left'
    topo += tamanho * 0.36 + 14
  }
  const sob = !preco.sufixo && preco.valor === 'Sob consulta'
  let t = sob ? Math.round(tamanho * 0.72) : tamanho
  ctx.font = fonte(800, t)
  const sufixo = preco.sufixo ? ` ${preco.sufixo}` : ''
  const tamSufixo = Math.round(tamanho * 0.38)
  const medirTudo = () => {
    ctx.font = fonte(800, t)
    const v = ctx.measureText(preco.valor).width
    ctx.font = fonte(600, tamSufixo, TEXTO)
    return v + (sufixo ? ctx.measureText(sufixo).width + 8 : 0)
  }
  while (medirTudo() > larguraMax && t > 40) t -= 4
  const total = medirTudo()
  const x0 = alinhar === 'centro' ? x - total / 2 : x
  const base = topo + t * 0.82
  if (!desenhar) return base - y + t * 0.2
  ctx.font = fonte(800, t)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillText(preco.valor, x0, base)
  if (sufixo) {
    const vx = x0 + ctx.measureText(preco.valor).width + 8
    ctx.font = fonte(600, tamSufixo, TEXTO)
    ctx.fillStyle = 'rgba(255,255,255,0.78)'
    ctx.fillText(sufixo, vx, base)
  }
  return base - y + t * 0.2
}

/** Nome do produto/título: ajusta o tamanho para caber nas linhas. Devolve a altura usada. */
function desenharTitulo(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, largura: number, tamanhos: number[], maxLinhas: number, alinhar: 'esquerda' | 'centro' = 'esquerda', desenhar = true) {
  const r = ajustarTexto(texto, {
    tamanhos,
    largura,
    maxLinhas,
    medir: (t, tam) => {
      ctx.font = fonte(800, tam)
      return ctx.measureText(t).width
    },
  })
  const entre = Math.round(r.tamanho * 1.08)
  if (!desenhar) return r.tamanho * 0.85 + (r.linhas.length - 1) * entre + r.tamanho * 0.25
  ctx.font = fonte(800, r.tamanho)
  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = alinhar === 'centro' ? 'center' : 'left'
  r.linhas.forEach((l, i) => ctx.fillText(l, x, y + r.tamanho * 0.85 + i * entre))
  ctx.textAlign = 'left'
  return r.tamanho * 0.85 + (r.linhas.length - 1) * entre + r.tamanho * 0.25
}

/** QR num cartão branco com legenda */
function desenharQr(ctx: CanvasRenderingContext2D, qr: HTMLImageElement | null, x: number, y: number, lado: number, legenda: string | null, cores: CoresTema) {
  const pad = Math.round(lado * 0.08)
  const alturaLegenda = legenda ? Math.round(lado * 0.16) : 0
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.3)'
  ctx.shadowBlur = 50
  ctx.shadowOffsetY = 18
  ctx.fillStyle = '#FFFFFF'
  caixa(ctx, x, y, lado, lado + alturaLegenda, Math.round(lado * 0.08))
  ctx.fill()
  ctx.restore()
  if (qr) ctx.drawImage(qr, x + pad, y + pad, lado - pad * 2, lado - pad * 2)
  if (legenda) {
    ctx.fillStyle = cores.escuro
    ctx.font = fonte(800, Math.round(lado * 0.056))
    ctx.textAlign = 'center'
    ctx.fillText(legenda, x + lado / 2, y + lado + alturaLegenda * 0.18)
    ctx.textAlign = 'left'
  }
  return lado + alturaLegenda
}

// ─── Composições ───────────────────────────────────────────────────────────

const MARGEM = 84

function statusProduto(ctx: CanvasRenderingContext2D, d: DadosArte, p: NonNullable<DadosArte['produto']>) {
  const { largura: W, altura: H } = TAMANHO_ARTE.status
  const lado = W - MARGEM * 2
  desenharMarca(ctx, d, MARGEM, 104, lado)
  // De baixo para cima: rodapé (chamada e site), texto e, no espaço que sobra, a foto (até quadrada)
  const topoChamada = H - 296
  const titulos = [92, 84, 76, 68, 60]
  const alturaSelo = p.categoria ? 54 + 30 : 0
  const alturaTitulo = desenharTitulo(ctx, p.nome, MARGEM, 0, lado, titulos, 2, 'esquerda', false)
  const alturaPreco = desenharPreco(ctx, p.preco, MARGEM, 0, 112, lado, 'esquerda', false)
  const alturaTexto = alturaSelo + alturaTitulo + 30 + alturaPreco
  const yFoto = 262
  const alturaFoto = Math.max(420, Math.min(lado, topoChamada - 70 - alturaTexto - 64 - yFoto))
  desenharFoto(ctx, p.foto, MARGEM, yFoto, lado, alturaFoto, 56, p.nome.charAt(0), d.cores)
  let y = yFoto + alturaFoto + 64
  if (p.categoria) y += desenharSelo(ctx, p.categoria, MARGEM, y, 26, lado) + 30
  y += desenharTitulo(ctx, p.nome, MARGEM, y, lado, titulos, 2) + 30
  desenharPreco(ctx, p.preco, MARGEM, y, 112, lado)
  desenharChamada(ctx, MARGEM, topoChamada, 116, d.cores, 'esquerda', 'Peça pelo WhatsApp', lado)
  desenharSite(ctx, d.site, MARGEM + 6, H - 118, 34, lado)
}

function postProduto(ctx: CanvasRenderingContext2D, d: DadosArte, p: NonNullable<DadosArte['produto']>) {
  const { largura: W, altura: H } = TAMANHO_ARTE.post
  const m = 64
  desenharMarca(ctx, d, m, m, W - m * 2, 80)
  // Foto à direita, texto à esquerda
  const wFoto = 470
  const xFoto = W - m - wFoto
  const yFoto = 192
  desenharFoto(ctx, p.foto, xFoto, yFoto, wFoto, H - yFoto - m, 44, p.nome.charAt(0), d.cores)
  const larguraTexto = xFoto - m - 44
  // Texto e chamada centralizados na altura da foto (o site fica no pé)
  const titulos = [64, 58, 52, 46, 40]
  const alturaSelo = p.categoria ? 42 + 24 : 0
  const alturaTitulo = desenharTitulo(ctx, p.nome, m, 0, larguraTexto, titulos, 4, 'esquerda', false)
  const alturaPreco = desenharPreco(ctx, p.preco, m, 0, 80, larguraTexto, 'esquerda', false)
  const total = alturaSelo + alturaTitulo + 24 + alturaPreco + 56 + 88
  let y = Math.max(yFoto, yFoto + (H - m - 70 - yFoto - total) / 2)
  if (p.categoria) y += desenharSelo(ctx, p.categoria, m, y, 20, larguraTexto) + 24
  y += desenharTitulo(ctx, p.nome, m, y, larguraTexto, titulos, 4) + 24
  y += desenharPreco(ctx, p.preco, m, y, 80, larguraTexto) + 56
  desenharChamada(ctx, m, Math.min(y, H - m - 152), 88, d.cores, 'esquerda', 'Peça pelo WhatsApp', larguraTexto)
  desenharSite(ctx, d.site, m + 4, H - m - 20, 24, larguraTexto)
}

/** Fotos dos produtos em leque (a do meio um pouco acima). Devolve a parte de baixo. */
function desenharLeque(ctx: CanvasRenderingContext2D, fotos: HTMLImageElement[], x: number, y: number, largura: number, lado: number, cores: CoresTema) {
  if (!fotos.length) return y
  const passo = fotos.length === 1 ? 0 : (largura - lado) / (fotos.length - 1)
  fotos.forEach((f, i) => {
    ctx.save()
    const cx = fotos.length === 1 ? x + largura / 2 : x + i * passo + lado / 2
    const ang = fotos.length === 1 ? 0 : ((i - (fotos.length - 1) / 2) * 6 * Math.PI) / 180
    ctx.translate(cx, y + lado / 2 + (i === 1 && fotos.length === 3 ? -16 : 0))
    ctx.rotate(ang)
    desenharFoto(ctx, f, -lado / 2, -lado / 2, lado, lado, Math.round(lado * 0.12), '', cores)
    ctx.restore()
  })
  return y + lado + 20
}

function statusLoja(ctx: CanvasRenderingContext2D, d: DadosArte, v: NonNullable<DadosArte['vitrine']>, qr: HTMLImageElement | null) {
  const { largura: W, altura: H } = TAMANHO_ARTE.status
  const largura = W - MARGEM * 2
  // O título já é o nome da loja: no topo, só a logo
  desenharMarca(ctx, d, MARGEM, 104, largura, 96, !d.logo)
  let y = 270
  desenharSelo(ctx, 'Vitrine online', MARGEM, y, 26, 600)
  y += 84
  y += desenharTitulo(ctx, v.titulo, MARGEM, y, largura, [104, 92, 80, 70], 2) + 10
  if (v.slogan) {
    ctx.font = fonte(500, 40, TEXTO)
    ctx.fillStyle = 'rgba(255,255,255,0.82)'
    const { linhas } = quebrarLinhas(v.slogan, largura, (t) => ctx.measureText(t).width, 3)
    linhas.forEach((l, i) => ctx.fillText(l, MARGEM, y + 40 + i * 54))
    y += 40 + linhas.length * 54
  }
  const fotos = v.fotos.slice(0, 3)
  const topoChamada = H - 300
  y = desenharLeque(ctx, fotos, MARGEM, y + 70, largura, fotos.length === 1 ? 400 : 300, d.cores)
  // QR do site no espaço que sobra até a chamada
  const espaco = topoChamada - 70 - (y + 50)
  const ladoQr = Math.max(260, Math.min(400, espaco / 1.16))
  const yQr = y + 50 + Math.max(0, (espaco - ladoQr * 1.16) / 2)
  desenharQr(ctx, qr, (W - ladoQr) / 2, yQr, ladoQr, 'Aponte a câmera', d.cores)
  desenharChamada(ctx, W / 2, topoChamada, 120, d.cores, 'centro', 'Peça seu orçamento', largura)
  desenharSite(ctx, d.site, W / 2, H - 120, 36, largura, 'centro')
}

function postLoja(ctx: CanvasRenderingContext2D, d: DadosArte, v: NonNullable<DadosArte['vitrine']>, qr: HTMLImageElement | null) {
  const { largura: W, altura: H } = TAMANHO_ARTE.post
  const m = 72
  desenharMarca(ctx, d, m, m, W - m * 2, 84, !d.logo)
  const ladoQr = 330
  const larguraTexto = W - m * 2 - ladoQr - 56
  let y = 220
  desenharSelo(ctx, 'Vitrine online', m, y, 22, larguraTexto)
  y += 72
  y += desenharTitulo(ctx, v.titulo, m, y, larguraTexto, [76, 68, 60, 52, 46], 3) + 6
  if (v.slogan) {
    ctx.font = fonte(500, 30, TEXTO)
    ctx.fillStyle = 'rgba(255,255,255,0.82)'
    const { linhas } = quebrarLinhas(v.slogan, larguraTexto, (t) => ctx.measureText(t).width, 3)
    linhas.forEach((l, i) => ctx.fillText(l, m, y + 30 + i * 42))
    y += 30 + linhas.length * 42
  }
  const topoChamada = H - m - 170
  // Miniaturas dos produtos, se couberem entre o texto e a chamada
  const fotos = v.fotos.slice(0, 3)
  const ladoFoto = Math.min(150, (larguraTexto - 36) / 3)
  if (fotos.length && y + 50 + ladoFoto < topoChamada - 30) {
    fotos.forEach((f, i) => desenharFoto(ctx, f, m + i * (ladoFoto + 18), y + 50, ladoFoto, ladoFoto, 24, '', d.cores))
  }
  desenharQr(ctx, qr, W - m - ladoQr, 220, ladoQr, 'Aponte a câmera', d.cores)
  desenharChamada(ctx, m, topoChamada, 96, d.cores, 'esquerda', 'Peça seu orçamento', W - m * 2)
  desenharSite(ctx, d.site, m + 4, H - m - 26, 28, W - m * 2)
}

/** Desenha a arte e devolve o PNG */
export async function gerarArte(formato: FormatoArte, d: DadosArte): Promise<Blob> {
  await carregarFontes()
  const { largura, altura } = TAMANHO_ARTE[formato]
  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('O navegador não conseguiu desenhar a imagem.')
  desenharFundo(ctx, largura, altura, d.cores)
  if (d.produto) {
    if (formato === 'status') statusProduto(ctx, d, d.produto)
    else postProduto(ctx, d, d.produto)
  } else if (d.vitrine) {
    const qr = await imagemQr(d.vitrine.url, d.cores.escuro)
    if (formato === 'status') statusLoja(ctx, d, d.vitrine, qr)
    else postLoja(ctx, d, d.vitrine, qr)
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível gerar a imagem.'))), 'image/png'))
}
