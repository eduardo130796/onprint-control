/** Contraste WCAG para cores configuráveis (status): escurece a cor até ler bem sobre o próprio fundo claro. */
type Rgb = [number, number, number]

function rgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  const cheio = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6)
  return [0, 2, 4].map((i) => parseInt(cheio.slice(i, i + 2), 16) || 0) as Rgb
}

function hex([r, g, b]: Rgb) {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

function luminancia(c: Rgb) {
  const [r, g, b] = c.map((v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }) as Rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function razaoContraste(a: string, b: string) {
  const [l1, l2] = [luminancia(rgb(a)), luminancia(rgb(b))].sort((x, y) => y - x) as [number, number]
  return (l1 + 0.05) / (l2 + 0.05)
}

/** Fundo do badge: a cor com a opacidade dada sobre o branco. */
export function fundoSuave(cor: string, opacidade = 0.12) {
  return hex(rgb(cor).map((c) => 255 + (c - 255) * opacidade) as Rgb)
}

/** A própria cor, escurecida o mínimo necessário para contraste AA (4,5:1) sobre `fundo`. */
export function textoLegivel(cor: string, fundo = fundoSuave(cor)) {
  let atual = rgb(cor)
  for (let i = 0; i < 20 && razaoContraste(hex(atual), fundo) < 4.5; i++) atual = atual.map((c) => c * 0.9) as Rgb
  return hex(atual)
}
