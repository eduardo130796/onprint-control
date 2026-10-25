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
 * abre o voto aqui.
 *
 * Quais jids entram (conferido no Baileys 7.0.0-rc.9 e na Evolution v2.3.7, dentro do container):
 * - Baileys (Utils/process-message.js, hoje comentado): criador = getKeyAuthor(pollCreationMessageKey, meId normalizado)
 *   = o número da conta (a enquete é nossa, fromMe); votante = getKeyAuthor(key) = participantAlt || remoteJidAlt ||
 *   participant || remoteJid. Os dois passam por jidNormalizedUser ("usuário@servidor", sem o ":aparelho").
 * - Evolution (whatsapp.baileys.service.ts, messages.upsert): tenta criador ∈ { instance.wuid (número), client.user.lid
 *   (LID da conta = creds.me.lid), pollCreationMessageKey.participant/participantAlt/remoteJid } × votante ∈ { wuid,
 *   user.lid, key.participant, participantAlt, remoteJidAlt, remoteJid }, todos com jidNormalizedUser.
 * - O que o WhatsApp do cliente usa de fato é a identidade da conversa: no endereçamento novo (addressingMode "lid")
 *   criador = LID da gráfica e votante = LID do cliente, e nenhum dos dois vem no webhook:
 *   · a Evolution troca key.remoteJid "…@lid" pelo remoteJidAlt (número) antes de mandar o webhook (o LID do cliente
 *     só sobra em pollCreationMessageKey.remoteJid, que o cleanMessage do Baileys troca pela conversa, "…@lid");
 *   · o LID da gráfica (creds.me.lid) não sai em nenhuma rota da Evolution: a API lê das credenciais da instância
 *     (integrations/whatsapp/credenciais-evolution.ts) e guarda em whatsapp_config.lid.
 * Por isso tentamos todas as combinações { número, LID da gráfica } × { número, LID do cliente } (sem o aparelho):
 * a etiqueta do GCM só confere com a certa.
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

/**
 * "5511…:12@s.whatsapp.net" → "5511…@s.whatsapp.net" e "1234…:6@lid" → "1234…@lid" (sem o aparelho nem o agente
 * "_N"), como o jidNormalizedUser do Baileys (jidDecode: "usuário_agente:aparelho@servidor"; c.us vira s.whatsapp.net)
 */
export function jidNormalizado(jid: string): string {
  const [usuario, servidor] = jid.trim().split('@')
  if (!servidor) return jid
  return `${usuario!.split(':')[0]!.split('_')[0]}@${servidor === 'c.us' ? 's.whatsapp.net' : servidor}`
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

export interface DadosDoVoto {
  idEnquete: string
  segredo: Buffer
  opcoes: readonly string[]
  /** Identidades possíveis da gráfica (número e LID) e do cliente (número e LID); vazias e repetidas são ignoradas */
  criadores: (string | null | undefined)[]
  votantes: (string | null | undefined)[]
}

export interface VotoAberto {
  /** Nomes das opções escolhidas (lista vazia = o cliente tirou o voto) */
  opcoes: string[]
  /** O par que abriu (normalizado) */
  criadorJid: string
  votanteJid: string
}

/** Jids distintos, normalizados (sem aparelho), na ordem em que vieram */
export function jidsUnicos(lista: (string | null | undefined)[]): string[] {
  return [...new Set(lista.filter((j): j is string => typeof j === 'string' && j.includes('@')).map(jidNormalizado))]
}

/** Tenta cada criador × votante; null = não abriu com nenhum */
export function abrirVotoComIdentidades(voto: VotoCifrado, dados: DadosDoVoto): VotoAberto | null {
  for (const criadorJid of jidsUnicos(dados.criadores)) {
    for (const votanteJid of jidsUnicos(dados.votantes)) {
      const hashes = abrirVoto(voto, { idEnquete: dados.idEnquete, segredo: dados.segredo, criadorJid, votanteJid })
      if (hashes) return { opcoes: dados.opcoes.filter((o) => hashes.some((h) => h.equals(hashOpcao(o)))), criadorJid, votanteJid }
    }
  }
  return null
}

/**
 * Nomes das opções escolhidas (na ordem da enquete); null = não abriu com nenhum par (lista vazia = o cliente tirou
 * o voto).
 */
export function opcoesDoVoto(voto: VotoCifrado, dados: DadosDoVoto): string[] | null {
  return abrirVotoComIdentidades(voto, dados)?.opcoes ?? null
}

export const ehLid = (jid: string | null | undefined): jid is string => typeof jid === 'string' && /@(lid|hosted\.lid)$/.test(jid)

/** "5511988887777@s.whatsapp.net" → "…7777@s.whatsapp.net" (log sem o número inteiro) */
export function mascararJid(jid: string | null | undefined): string | null {
  if (!jid) return null
  const [usuario, servidor] = jid.split('@')
  return `…${(usuario ?? '').slice(-4)}${servidor ? `@${servidor}` : ''}`
}

/**
 * Voto que não abriu, guardado na linha do orçamento (mensagens_whatsapp.voto_bruto) para tentar de novo depois
 * (reprocessarVotosGuardados em respostas.service.ts) — bytes em base64.
 */
export interface VotoBruto {
  idMensagem: string
  idEnquete: string
  encPayload: string
  encIv: string
  /** Jids vistos no aviso: de quem votou e de quem criou a enquete (chave da enquete como chegou) */
  votantes: string[]
  criadores: string[]
  chaveEnquete: { remoteJid: string | null; participant: string | null; fromMe: boolean | null } | null
  /** Identidades da gráfica conhecidas na hora (as que não abriram) */
  grafica: string[]
  recebidoEm: string
}

export function votoBrutoParaGuardar(dados: Omit<VotoBruto, 'encPayload' | 'encIv'> & { cifrado: VotoCifrado }): VotoBruto {
  const { cifrado, ...resto } = dados
  return { ...resto, encPayload: cifrado.encPayload.toString('base64'), encIv: cifrado.encIv.toString('base64') }
}

/** Linha do banco → voto cifrado (null se não for um VotoBruto) */
export function votoDoBruto(valor: unknown): (VotoBruto & { cifrado: VotoCifrado }) | null {
  const v = valor as Partial<VotoBruto> | null
  if (!v || typeof v !== 'object' || typeof v.encPayload !== 'string' || typeof v.encIv !== 'string' || typeof v.idEnquete !== 'string' || typeof v.idMensagem !== 'string') return null
  const lista = (l: unknown) => (Array.isArray(l) ? l.filter((j): j is string => typeof j === 'string') : [])
  return {
    idMensagem: v.idMensagem,
    idEnquete: v.idEnquete,
    encPayload: v.encPayload,
    encIv: v.encIv,
    votantes: lista(v.votantes),
    criadores: lista(v.criadores),
    chaveEnquete: v.chaveEnquete ?? null,
    grafica: lista(v.grafica),
    recebidoEm: typeof v.recebidoEm === 'string' ? v.recebidoEm : new Date(0).toISOString(),
    cifrado: { encPayload: Buffer.from(v.encPayload, 'base64'), encIv: Buffer.from(v.encIv, 'base64') },
  }
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
