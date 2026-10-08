/**
 * Cores do tema da empresa (Configurações → Aparência). Paleta fechada: cada cor já vem com as variações
 * e o contraste testados (texto sobre a cor e a versão escura como texto sobre fundo claro, nível AA).
 * - cor: botões, menu ativo, barras e destaques
 * - escuro: texto e ícones na cor da marca sobre fundo claro (links, valores, selos)
 * - hover: botão com o mouse em cima
 * - suave: fundo claro de destaque (cartão selecionado, selo)
 * - contraste: texto sobre a cor (escuro nas cores claras, branco nas escuras)
 */
export interface CoresTema {
  cor: string
  escuro: string
  hover: string
  suave: string
  contraste: string
}

const ESCURO = '#1E2226'
const BRANCO = '#FFFFFF'

export const TEMAS = {
  verde: { nome: 'Verde ONPrint', cor: '#25D366', escuro: '#0B776D', hover: '#1EBE5A', suave: '#E9F9EF', contraste: ESCURO },
  azul: { nome: 'Azul', cor: '#2563EB', escuro: '#1D4ED8', hover: '#1D4ED8', suave: '#EAF1FD', contraste: BRANCO },
  petroleo: { nome: 'Petróleo', cor: '#0F766E', escuro: '#0F766E', hover: '#115E59', suave: '#E6F6F4', contraste: BRANCO },
  roxo: { nome: 'Roxo', cor: '#7C3AED', escuro: '#6D28D9', hover: '#6D28D9', suave: '#F3EEFE', contraste: BRANCO },
  rosa: { nome: 'Rosa', cor: '#DB2777', escuro: '#BE185D', hover: '#BE185D', suave: '#FDEEF6', contraste: BRANCO },
  vinho: { nome: 'Vinho', cor: '#BE123C', escuro: '#9F1239', hover: '#9F1239', suave: '#FDEDF1', contraste: BRANCO },
  laranja: { nome: 'Laranja', cor: '#F97316', escuro: '#C2410C', hover: '#EA580C', suave: '#FFF1E6', contraste: ESCURO },
  amarelo: { nome: 'Amarelo', cor: '#FACC15', escuro: '#A16207', hover: '#EAB308', suave: '#FEF9E3', contraste: ESCURO },
  grafite: { nome: 'Grafite', cor: '#334155', escuro: '#334155', hover: '#1E293B', suave: '#EEF1F5', contraste: BRANCO },
} as const satisfies Record<string, CoresTema & { nome: string }>

export type CodigoTema = keyof typeof TEMAS
export const CODIGOS_TEMA = Object.keys(TEMAS) as CodigoTema[]
export const TEMA_PADRAO: CodigoTema = 'verde'

export const temaOuPadrao = (codigo: string | null | undefined): CodigoTema => (codigo && codigo in TEMAS ? (codigo as CodigoTema) : TEMA_PADRAO)

/** "#RRGGBB" → [r, g, b] */
export function hexParaRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** "#RRGGBB" → "H S% L%" (formato das variáveis do shadcn) */
export function hexParaHsl(hex: string): string {
  const [r, g, b] = hexParaRgb(hex).map((v) => v / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

/** Luminância relativa (WCAG) */
function luminancia(hex: string) {
  const [r, g, b] = hexParaRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Contraste WCAG entre duas cores (1 a 21) */
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

/**
 * Cor da paleta mais próxima de uma cor (ex.: a média da logo), pelo matiz; cores quase sem saturação
 * (logo preta, cinza ou branca) sugerem o grafite.
 */
export function temaMaisProximo(hex: string): CodigoTema {
  const [h, s] = hexParaHsl(hex)
    .split(' ')
    .map((v) => parseFloat(v)) as [number, number]
  if (s < 18) return 'grafite'
  let melhor: CodigoTema = TEMA_PADRAO
  let menor = Infinity
  for (const codigo of CODIGOS_TEMA) {
    if (codigo === 'grafite') continue
    const hc = parseFloat(hexParaHsl(TEMAS[codigo].cor))
    const dist = Math.min(Math.abs(h - hc), 360 - Math.abs(h - hc))
    if (dist < menor) {
      menor = dist
      melhor = codigo
    }
  }
  return melhor
}
