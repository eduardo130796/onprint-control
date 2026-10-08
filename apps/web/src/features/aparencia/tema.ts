import { TEMAS, hexParaHsl, hexParaRgb, temaOuPadrao } from '@onprint/shared'

const rgb = (hex: string) => hexParaRgb(hex).join(' ')

/**
 * Aplica a cor do tema da empresa nas variáveis do CSS (classes marca-* do Tailwind e as do shadcn).
 * Sem código (ou o padrão), volta ao verde ONPrint definido no index.css.
 */
export function aplicarTema(codigo: string | null | undefined) {
  const raiz = document.documentElement.style
  const nomes = ['--marca', '--marca-escuro', '--marca-hover', '--marca-suave', '--marca-contraste', '--primary', '--primary-foreground', '--accent', '--ring']
  if (!codigo || temaOuPadrao(codigo) === 'verde') {
    for (const n of nomes) raiz.removeProperty(n)
    return
  }
  const t = TEMAS[temaOuPadrao(codigo)]
  raiz.setProperty('--marca', rgb(t.cor))
  raiz.setProperty('--marca-escuro', rgb(t.escuro))
  raiz.setProperty('--marca-hover', rgb(t.hover))
  raiz.setProperty('--marca-suave', rgb(t.suave))
  raiz.setProperty('--marca-contraste', rgb(t.contraste))
  raiz.setProperty('--primary', hexParaHsl(t.cor))
  raiz.setProperty('--primary-foreground', hexParaHsl(t.contraste))
  raiz.setProperty('--accent', hexParaHsl(t.suave))
  raiz.setProperty('--ring', hexParaHsl(t.escuro))
}

const FAVICON_PADRAO = '/favicon.svg'
export const TITULO_PADRAO = 'ONPrint Control'

/** Ícone da aba: a logo da empresa (quando houver) ou o da ONPrint. */
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
