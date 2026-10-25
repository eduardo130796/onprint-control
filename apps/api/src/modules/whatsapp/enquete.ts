import { createCipheriv, createDecipheriv, createHash, createHmac } from 'node:crypto'

/*
 * Voto da enquete do WhatsApp (o mesmo algoritmo do Baileys, decryptPollVote em Utils/process-message):
 * o voto chega cifrado (encPayload + encIv, AES-256-GCM) e a chave sai do messageSecret da enquete (guardado no envio),
 * do id da enquete, de quem criou (a gráfica) e de quem votou (o cliente):
 *   key0  = HMAC-SHA256(chave = 32 bytes zero, dado = messageSecret)
 *   chave = HMAC-SHA256(chave = key0, dado = idEnquete + criador + votante + "Poll Vote" + 0x01)
 *   aad   = idEnquete + "\0" + votante
 * Por dentro vem um PollVoteMessage (protobuf: campo 1 repetido = SHA-256 do nome de cada opção escolhida).
 *
 * A Evolution só abre o voto sozinha quando guarda as mensagens no banco dela (DATABASE_SAVE_DATA_NEW_MESSAGE),
 * o que não fazemos (seriam todas as conversas do número da gráfica). Por isso a API guarda o segredo da enquete e
 * abre o voto aqui. Com a conta já no endereçamento novo do WhatsApp (LID), criador e votante podem vir como
 * "...@lid" em vez do número: tentamos as combinações conhecidas (a autenticação do GCM confirma a certa).
 */

const GCM_TAG = 16

export interface VotoCifrado {
  encPayload: Buffer
  encIv: Buffer
}

interface ContextoVoto {
  idEnquete: string
  criadorJid: string
  votanteJid: string
  segredo: Buffer
}

function chaveDoVoto({ idEnquete, criadorJid, votanteJid, segredo }: ContextoVoto): Buffer {
  const key0 = createHmac('sha256', Buffer.alloc(32)).update(segredo).digest()
  const sign = Buffer.concat([Buffer.from(idEnquete), Buffer.from(criadorJid), Buffer.from(votanteJid), Buffer.from('Poll Vote'), Buffer.from([1])])
  return createHmac('sha256', key0).update(sign).digest()
}

const aad = (c: ContextoVoto) => Buffer.from(`${c.idEnquete}\u0000${c.votanteJid}`)

/** "5511…:12@s.whatsapp.net" → "5511…@s.whatsapp.net" (sem o aparelho), como o jidNormalizedUser do Baileys */
export function jidNormalizado(jid: string): string {
  const [usuario, servidor] = jid.split('@')
  if (!servidor) return jid
  return `${usuario!.split(':')[0]}@${servidor === 'c.us' ? 's.whatsapp.net' : servidor}`
}

/** Lê o PollVoteMessage: campo 1 (bytes, repetido) = hashes das opções escolhidas */
export function lerPollVote(buf: Buffer): Buffer[] {
  const opcoes: Buffer[] = []
  let i = 0
  const varint = () => {
    let valor = 0
    let deslocamento = 0
    for (;;) {
      if (i >= buf.length) throw new Error('protobuf truncado')
      const b = buf[i++]!
      valor += (b & 0x7f) * 2 ** deslocamento
      if (!(b & 0x80)) return valor
      deslocamento += 7
    }
  }
  while (i < buf.length) {
    const tag = varint()
    const campo = Math.floor(tag / 8)
    const tipo = tag & 7
    if (tipo === 2) {
      const tamanho = varint()
      const dado = buf.subarray(i, i + tamanho)
      i += tamanho
      if (campo === 1) opcoes.push(Buffer.from(dado))
    } else if (tipo === 0) varint()
    else if (tipo === 1) i += 8
    else if (tipo === 5) i += 4
    else throw new Error('protobuf inválido')
  }
  return opcoes
}

/** Abre o voto com um par criador/votante; null se a chave não confere */
export function abrirVoto(voto: VotoCifrado, c: ContextoVoto): Buffer[] | null {
  // Só a etiqueta (16 bytes) = voto vazio (o cliente tirou o voto)
  if (voto.encPayload.length < GCM_TAG || voto.encIv.length === 0) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', chaveDoVoto(c), voto.encIv)
    decipher.setAAD(aad(c))
    decipher.setAuthTag(voto.encPayload.subarray(voto.encPayload.length - GCM_TAG))
    const claro = Buffer.concat([decipher.update(voto.encPayload.subarray(0, voto.encPayload.length - GCM_TAG)), decipher.final()])
    return lerPollVote(claro)
  } catch {
    return null
  }
}

const hashOpcao = (nome: string) => createHash('sha256').update(nome).digest()

/**
 * Nomes das opções escolhidas (na ordem da enquete). Tenta cada criador × votante; null = não abriu com nenhum
 * (lista vazia = o cliente tirou o voto).
 */
export function opcoesDoVoto(voto: VotoCifrado, dados: { idEnquete: string; segredo: Buffer; opcoes: readonly string[]; criadores: string[]; votantes: string[] }): string[] | null {
  const unicos = (l: string[]) => [...new Set(l.filter(Boolean).map(jidNormalizado))]
  for (const criadorJid of unicos(dados.criadores)) {
    for (const votanteJid of unicos(dados.votantes)) {
      const hashes = abrirVoto(voto, { idEnquete: dados.idEnquete, segredo: dados.segredo, criadorJid, votanteJid })
      if (hashes) return dados.opcoes.filter((o) => hashes.some((h) => h.equals(hashOpcao(o))))
    }
  }
  return null
}

/** Cifra um voto como o WhatsApp do cliente faria (testes e simulação no modo de teste) */
export function cifrarVoto(opcoes: string[], c: ContextoVoto, iv: Buffer): VotoCifrado {
  const partes = opcoes.map((o) => {
    const h = hashOpcao(o)
    return Buffer.concat([Buffer.from([0x0a, h.length]), h])
  })
  const cipher = createCipheriv('aes-256-gcm', chaveDoVoto(c), iv)
  cipher.setAAD(aad(c))
  const cifrado = Buffer.concat([cipher.update(Buffer.concat(partes)), cipher.final()])
  return { encPayload: Buffer.concat([cifrado, cipher.getAuthTag()]), encIv: iv }
}
