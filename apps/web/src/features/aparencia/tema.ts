import { TEMAS, TEMA_PADRAO, hexParaHsl, hexParaRgb, temaNoEscuro, temaOuPadrao, type CoresTema } from '@onprint/shared'

const rgb = (hex: string) => hexParaRgb(hex).join(' ')

function variaveis(t: CoresTema) {
  return [
    `--marca: ${rgb(t.cor)}`,
    `--marca-escuro: ${rgb(t.escuro)}`,
    `--marca-hover: ${rgb(t.hover)}`,
    `--marca-suave: ${rgb(t.suave)}`,
    `--marca-contraste: ${rgb(t.contraste)}`,
    `--primary: ${hexParaHsl(t.cor)}`,
    `--primary-foreground: ${hexParaHsl(t.contraste)}`,
    `--accent: ${hexParaHsl(t.suave)}`,
    `--ring: ${hexParaHsl(t.escuro)}`,
  ].join('; ')
}

/**
 * Aplica a cor do tema da empresa: uma folha de estilo com as variáveis do modo claro (:root) e do escuro
 * (.dark, com o texto na cor clareado e o fundo suave tingido). Sem código, volta ao verde ONPrint do index.css.
 */
export function aplicarTema(codigo: string | null | undefined) {
  let estilo = document.getElementById('tema-empresa')
  if (!codigo || temaOuPadrao(codigo) === TEMA_PADRAO) {
    estilo?.remove()
    return
  }
  const t = TEMAS[temaOuPadrao(codigo)]
  if (!estilo) {
    estilo = document.createElement('style')
    estilo.id = 'tema-empresa'
    document.head.appendChild(estilo)
  }
  estilo.textContent = `:root { ${variaveis(t)} } .dark { ${variaveis(temaNoEscuro(t))} }`
}

export type ModoTela = 'claro' | 'escuro' | 'sistema'
export const MODO_ROTULOS: Record<ModoTela, string> = { claro: 'Claro', escuro: 'Escuro', sistema: 'Igual ao sistema' }
let pararDeOuvir: (() => void) | null = null

/** Liga ou desliga o modo escuro no <html>; "sistema" acompanha o Windows/celular enquanto a tela estiver aberta. */
export function aplicarModo(modo: ModoTela | null) {
  pararDeOuvir?.()
  pararDeOuvir = null
  const raiz = document.documentElement
  if (!modo) {
    raiz.classList.remove('dark')
    return
  }
  if (modo !== 'sistema') {
    raiz.classList.toggle('dark', modo === 'escuro')
    return
  }
  const consulta = window.matchMedia('(prefers-color-scheme: dark)')
  const atualizar = () => raiz.classList.toggle('dark', consulta.matches)
  atualizar()
  consulta.addEventListener('change', atualizar)
  pararDeOuvir = () => consulta.removeEventListener('change', atualizar)
}

const FAVICON_PADRAO = '/favicon.svg'
export const TITULO_PADRAO = 'ONPrint Control'

/**
 * Ícone da aba gerado no navegador (64 px, nítido e sem link que expira): logo quase quadrada vai centralizada
 * num quadrado branco arredondado; logo larga (símbolo + nome) fica ilegível nesse tamanho e vira a inicial
 * da empresa na cor do tema. Sem logo, também a inicial.
 */
export async function gerarFavicon(opcoes: { logoUrl: string | null | undefined; nome: string; cor: string; contraste: string }): Promise<string | null> {
  const lado = 64
  const canvas = document.createElement('canvas')
  canvas.width = lado
  canvas.height = lado
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const quadrado = (fundo: string) => {
    ctx.fillStyle = fundo
    ctx.beginPath()
    ctx.roundRect(0, 0, lado, lado, 14)
    ctx.fill()
  }
  if (opcoes.logoUrl) {
    try {
      const bitmap = await createImageBitmap(await (await fetch(opcoes.logoUrl)).blob())
      const proporcao = bitmap.width / bitmap.height
      if (proporcao <= 1.5 && proporcao >= 0.67) {
        quadrado('#FFFFFF')
        const margem = 6
        const escala = Math.min((lado - margem * 2) / bitmap.width, (lado - margem * 2) / bitmap.height)
        const [w, h] = [bitmap.width * escala, bitmap.height * escala]
        ctx.drawImage(bitmap, (lado - w) / 2, (lado - h) / 2, w, h)
        return canvas.toDataURL('image/png')
      }
    } catch {
      // logo indisponível (SVG sem tamanho, rede): segue com a inicial
    }
  }
  quadrado(opcoes.cor)
  ctx.fillStyle = opcoes.contraste
  ctx.font = '800 40px Manrope, Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(opcoes.nome.trim().charAt(0).toUpperCase() || 'O', lado / 2, lado / 2 + 2)
  return canvas.toDataURL('image/png')
}

/** Ícone da aba: o gerado para a empresa ou o da ONPrint. */
export function definirFavicon(url: string | null | undefined) {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.removeAttribute('type')
  link.href = url || FAVICON_PADRAO
}

/**
 * Cor média da logo (pixels visíveis e não quase brancos), para sugerir a cor do tema.
 * A URL é assinada pela API; baixa como blob para o canvas poder ler os pixels.
 */
export async function corMediaDaImagem(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob()
    const bitmap = await createImageBitmap(blob)
    const lado = 48
    const canvas = document.createElement('canvas')
    canvas.width = lado
    canvas.height = lado
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, lado, lado)
    const { data } = ctx.getImageData(0, 0, lado, lado)
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let i = 0; i < data.length; i += 4) {
      const [pr, pg, pb, pa] = [data[i] as number, data[i + 1] as number, data[i + 2] as number, data[i + 3] as number]
      if (pa < 128 || (pr > 235 && pg > 235 && pb > 235)) continue
      // Pesa mais os pixels saturados (a cor da marca, não o contorno preto/cinza)
      const peso = 1 + (Math.max(pr, pg, pb) - Math.min(pr, pg, pb)) / 32
      r += pr * peso
      g += pg * peso
      b += pb * peso
      n += peso
    }
    if (!n) return null
    const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0')
    return `#${hex(r)}${hex(g)}${hex(b)}`
  } catch {
    return null
  }
}
