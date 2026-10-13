/**
 * Formatação do WhatsApp para as prévias (bolha): *negrito*, _itálico_, ~riscado~ e links.
 * Como no app: o marcador só vale encostado no texto (“* x *” não vira negrito) e não atravessa linhas.
 */
export interface Trecho {
  texto: string
  negrito?: boolean
  italico?: boolean
  riscado?: boolean
  link?: string
}

const LINK = /https?:\/\/[^\s]+[^\s.,;:!?)]/g
const MARCA = /(^|[\s(“"'])([*_~])(?=\S)([^\n]*?\S)\2(?=$|[\s.,;:!?)”"'])/g
const ESTILO = { '*': 'negrito', _: 'italico', '~': 'riscado' } as const

function formatar(texto: string): Trecho[] {
  const trechos: Trecho[] = []
  let ultimo = 0
  for (const m of texto.matchAll(MARCA)) {
    const inicio = m.index + m[1]!.length
    if (inicio > ultimo) trechos.push({ texto: texto.slice(ultimo, inicio) })
    // Negrito com itálico dentro ("*_x_*") vira os dois
    const interno = formatar(m[3]!)
    for (const t of interno) trechos.push({ ...t, [ESTILO[m[2] as keyof typeof ESTILO]]: true })
    ultimo = m.index + m[0].length
  }
  if (ultimo < texto.length) trechos.push({ texto: texto.slice(ultimo) })
  return trechos.filter((t) => t.texto)
}

/** Uma linha em trechos (links primeiro: o "_" de um endereço não vira itálico) */
export function trechosWhatsapp(linha: string): Trecho[] {
  const trechos: Trecho[] = []
  let ultimo = 0
  for (const m of linha.matchAll(LINK)) {
    if (m.index > ultimo) trechos.push(...formatar(linha.slice(ultimo, m.index)))
    trechos.push({ texto: m[0], link: m[0] })
    ultimo = m.index + m[0].length
  }
  if (ultimo < linha.length) trechos.push(...formatar(linha.slice(ultimo)))
  return trechos
}

/** Link sozinho na última linha (o WhatsApp mostra a prévia do primeiro link da mensagem) */
export function linkDaPrevia(texto: string): string | null {
  return texto.match(LINK)?.[0] ?? null
}
