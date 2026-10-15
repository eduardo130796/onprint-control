/**
 * Avisos do mesmo pedido que se encontram na fila (ex.: "pedido confirmado" e, logo depois, "arte para aprovação")
 * saem numa mensagem só. Os textos já preenchidos seguem o padrão (saudação, blocos, assinatura, link no fim):
 * a saudação fica a do primeiro e a assinatura a do último; o fechamento curto dos anteriores ("Avisamos por aqui
 * quando estiver pronto.") desce para antes da assinatura; um dado que um aviso seguinte traz de novo ("Próxima
 * parcela:", "Pago:", "Retirada:") fica só o do seguinte (o mais novo, sem contradição); o link de acompanhamento
 * dos anteriores sai quando um aviso seguinte traz o seu link e, quando nenhum traz, desce para o fim (fica um link
 * só, sempre na última linha); e sobra no máximo um emoji.
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
const linhas = (bloco: string) => bloco.split('\n')

/** Tira a linha do link e o rótulo logo acima dela ("Acompanhe o pedido aqui:") */
function tirarLink(bloco: string, link: string): string {
  const saida: string[] = []
  for (const linha of linhas(bloco)) {
    if (linha.trim() === link) {
      if (saida.length && /:\s*$/.test(saida[saida.length - 1]!)) saida.pop()
      continue
    }
    saida.push(linha)
  }
  return saida.join('\n').trim()
}

/** O link com o rótulo logo acima dele, se houver ("Acompanhe o pedido aqui:\nhttps://...") */
function blocoDoLink(bloco: string, link: string): string {
  const l = linhas(bloco)
  const i = l.findIndex((x) => x.trim() === link)
  return [i > 0 && /:\s*$/.test(l[i - 1]!) ? l[i - 1]!.trim() : null, link].filter(Boolean).join('\n')
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

const ehAssinatura = (linha: string) => /^—\s/.test(linha.trim())

/** Fechamento curto (uma linha, sem negrito, variável nem link): "Avisamos por aqui quando estiver pronto.", "Obrigado!" */
const ehFechamento = (bloco: string) => !bloco.includes('\n') && !/[*{]/.test(bloco) && !temLink(bloco)

/**
 * Rótulo do dado da linha ("Retirada: Rua…" → "retirada"). Pago/falta, a pagar, quitado e próxima parcela são um
 * dado só (o pagamento): o aviso mais novo diz como está, sem sobrar parcela de antes do pagamento. O Pix fica
 * enquanto falta pagar (sai se um aviso seguinte traz o seu ou diz que está quitado).
 */
function rotulo(linha: string): string {
  const m = /^([^:*•\n]{2,40}):\s+\S/.exec(linha.trim())
  if (!m) return ''
  const r = m[1]!.trim().toLowerCase()
  return ['pago', 'pagamento', 'a pagar', 'próxima parcela'].includes(r) ? 'pagamento' : r
}

/** Uma mensagem a partir dos avisos (na ordem em que entraram na fila) */
export function combinarAvisos(partes: ParteAviso[]): string {
  if (partes.length === 0) return ''
  if (partes.length === 1) return partes[0]!.texto.trim()
  const listas = partes.map((p) => blocosDe(p.texto))
  const doUltimo = new Set(listas[listas.length - 1]!.map(semEmoji))
  const saudacao = semEmoji(listas[0]![0] ?? '')
  const saida: string[] = []
  // Fechamentos dos avisos anteriores: descem para antes da assinatura do último
  const fechamentos: string[] = []
  // Link de acompanhamento que nenhum aviso seguinte substitui: desce para o fim
  let linkNoFim: string | null = null
  listas.forEach((blocos, i) => {
    if (i === listas.length - 1) {
      blocos.forEach((bloco, j) => {
        if (!(j === 0 && semEmoji(bloco) === saudacao)) saida.push(bloco)
      })
      return
    }
    const link = partes[i]!.linkDispensavel?.trim()
    const outroLinkDepois = partes.slice(i + 1).some((p) => temLink(p.texto))
    // Dados que um aviso seguinte traz de novo (mais novos): saem daqui
    const depois = listas.slice(i + 1).flatMap((bs) => bs.flatMap(linhas))
    const repetidos = new Set(depois.map(rotulo).filter(Boolean))
    if (depois.some((l) => /^pagamento:\s*\*?quitado/i.test(l.trim()))) repetidos.add('pix para pagar')
    blocos.forEach((bloco, j) => {
      if (i > 0 && j === 0 && semEmoji(bloco) === saudacao) return
      // Assinatura e fechamento repetidos ficam só no fim
      if (j > 0 && doUltimo.has(semEmoji(bloco))) return
      let b = linhas(bloco)
        .filter((l) => !ehAssinatura(l) && !repetidos.has(rotulo(l)))
        .join('\n')
        .trim()
      if (link && linhas(b).some((l) => l.trim() === link)) {
        if (!outroLinkDepois && !linkNoFim) linkNoFim = blocoDoLink(b, link)
        b = tirarLink(b, link)
      }
      // O bloco logo antes da assinatura (ou o que dividia o bloco com ela) é o fechamento
      const junto = linhas(bloco).some(ehAssinatura) || linhas(blocos[j + 1] ?? '').some(ehAssinatura)
      if (b && j > 1 && junto && ehFechamento(b)) {
        if (!fechamentos.includes(b) && !doUltimo.has(b)) fechamentos.push(b)
        return
      }
      if (b) saida.push(b)
    })
  })
  if (fechamentos.length) {
    // Antes do bloco da assinatura (sem assinatura: antes do bloco final com o link, ou no fim)
    let i = saida.length - 1
    while (i >= 0 && !linhas(saida[i]!).some(ehAssinatura)) i--
    if (i < 0) i = temLink(saida[saida.length - 1] ?? '') ? saida.length - 1 : saida.length
    saida.splice(i, 0, ...fechamentos)
  }
  if (linkNoFim) saida.push(linkNoFim)
  return umEmoji(saida.join('\n\n'))
}
