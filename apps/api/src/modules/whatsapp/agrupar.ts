/**
 * Avisos do mesmo pedido que se encontram na fila (ex.: "pedido confirmado" e, logo depois, "arte para aprovação")
 * saem numa mensagem só. Os textos já preenchidos seguem o padrão (saudação, blocos, assinatura, link no fim):
 * a saudação fica a do primeiro, a assinatura e o fechamento os do último, o link de acompanhamento dos anteriores
 * sai quando um aviso seguinte traz o seu link (fica um link só, no fim) e sobra no máximo um emoji.
 */
export interface ParteAviso {
  texto: string
  /** Link que pode sair do texto se um aviso seguinte trouxer outro (o de acompanhamento do pedido) */
  linkDispensavel?: string | null
}

const EMOJI = /\s?\p{Extended_Pictographic}️?/gu
const temLink = (texto: string) => /https?:\/\/\S/.test(texto)

const blocosDe = (texto: string) =>
  texto
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n[ \t]*\n/)
    .map((b) => b.trim())
    .filter(Boolean)

const semEmoji = (texto: string) => texto.replace(EMOJI, '').trim()

/** Tira a linha do link e o rótulo logo acima dela ("Acompanhe o pedido aqui:") */
function tirarLink(bloco: string, link: string): string {
  const saida: string[] = []
  for (const linha of bloco.split('\n')) {
    if (linha.trim() === link) {
      if (saida.length && /:\s*$/.test(saida[saida.length - 1]!)) saida.pop()
      continue
    }
    saida.push(linha)
  }
  return saida.join('\n').trim()
}

/** Mantém só o primeiro emoji da mensagem */
function umEmoji(texto: string): string {
  let visto = false
  return texto.replace(EMOJI, (e) => {
    if (visto) return ''
    visto = true
    return e
  })
}

/** Uma mensagem a partir dos avisos (na ordem em que entraram na fila) */
export function combinarAvisos(partes: ParteAviso[]): string {
  if (partes.length === 0) return ''
  if (partes.length === 1) return partes[0]!.texto.trim()
  const listas = partes.map((p) => blocosDe(p.texto))
  const doUltimo = new Set(listas[listas.length - 1]!.map(semEmoji))
  const saudacao = semEmoji(listas[0]![0] ?? '')
  const saida: string[] = []
  listas.forEach((blocos, i) => {
    const ultima = i === listas.length - 1
    // O link de acompanhamento só sai se depois vier outro link (a mensagem nunca fica sem link)
    const link = !ultima && partes.slice(i + 1).some((p) => temLink(p.texto)) ? partes[i]!.linkDispensavel?.trim() : null
    blocos.forEach((bloco, j) => {
      if (i > 0 && j === 0 && semEmoji(bloco) === saudacao) return
      let b = bloco
      if (!ultima) {
        // Assinatura e fechamento repetidos ficam só no fim
        if (j > 0 && doUltimo.has(semEmoji(b))) return
        if (link) b = tirarLink(b, link)
      }
      if (b) saida.push(b)
    })
  })
  return umEmoji(saida.join('\n\n'))
}
