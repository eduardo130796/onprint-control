import { createHmac, timingSafeEqual } from 'node:crypto'
import type { EstadoConexaoWhatsapp } from '@onprint/shared'
import { API_PREFIX } from '../../core/constantes'
import { bytesDoWhatsapp } from '../../integrations/whatsapp'
import type { VotoCifrado } from './enquete'

/*
 * Webhook da Evolution API v2.3.7 (POST no endereço configurado por /webhook/set/{instância}). A Evolution não assina
 * o aviso: o endereço leva um segredo por empresa (HMAC do segredo do servidor com o id da empresa), conferido junto
 * com o nome da instância ("grafygo-{id da empresa}") que vem no corpo.
 *
 * Corpo (EventController.emit): { event, instance, data, destination, date_time, sender (número conectado), server_url, apikey }
 *
 * - "connection.update": data = { instance, state: "open" | "connecting" | "close", statusReason, wuid?, profileName? }
 * - "messages.upsert": data = mensagem preparada (prepareMessage):
 *   { key: { remoteJid, remoteJidAlt?, fromMe, id, participant?, addressingMode? }, pushName, messageType,
 *     message: { conversation } (extendedTextMessage vira conversation), contextInfo: { stanzaId, participant, quotedMessage },
 *     messageTimestamp }
 *   Voto na enquete: messageType "pollUpdateMessage", message.pollUpdateMessage = { pollCreationMessageKey: { remoteJid,
 *   fromMe, id }, vote: { encPayload, encIv }, senderTimestampMs }. A Evolution só troca vote.selectedOptions pelos nomes
 *   (e põe data.pollUpdates = [{ name, voters }]) quando acha a enquete no banco dela; senão o voto vem cifrado e a API
 *   abre com o segredo guardado no envio (enquete.ts). Bytes vêm como objeto indexado ({ "0": 12, ... }).
 * - "messages.update": status de entrega/leitura; o Baileys 7 não emite mais pollUpdates por aqui (o voto vem no
 *   upsert), por isso o webhook nem assina este evento (se vier com pollUpdates, é lido igual).
 */

export type EventoWebhook =
  | { tipo: 'conexao'; estado: EstadoConexaoWhatsapp; numero: string | null; nomePerfil: string | null }
  | {
      tipo: 'voto'
      idMensagem: string
      idEnquete: string
      numero: string | null
      nome: string | null
      /** Nomes já abertos pela Evolution (null = veio cifrado) */
      opcoes: string[] | null
      cifrado: VotoCifrado | null
      /** Jids possíveis de quem votou e de quem criou a enquete (para abrir o voto) */
      votantes: string[]
      criadores: string[]
    }
  | { tipo: 'texto'; idMensagem: string; texto: string; citadoId: string | null; numero: string | null; nome: string | null }

export interface AvisoWebhook {
  instancia: string | null
  eventos: EventoWebhook[]
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null)
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

/** Número (só dígitos) de um jid de telefone ("5511…@s.whatsapp.net"); "@lid", grupo e lista não têm número */
export function numeroDoJid(jid: string | null | undefined): string | null {
  if (!jid || !/@(s\.whatsapp\.net|c\.us)$/.test(jid)) return null
  return jid.split('@')[0]!.split(':')[0]!.replace(/\D/g, '') || null
}

const jidDeConversa = (jid: string) => !/@(g\.us|broadcast|newsletter)$/.test(jid) && jid !== 'status@broadcast'

function textoDaMensagem(m: Obj): string | null {
  const ext = obj(m.extendedTextMessage)
  return (
    texto(m.conversation) ??
    texto(ext?.text) ??
    texto(obj(m.imageMessage)?.caption) ??
    texto(obj(m.videoMessage)?.caption) ??
    texto(obj(m.documentMessage)?.caption) ??
    texto(obj(m.buttonsResponseMessage)?.selectedDisplayText) ??
    texto(obj(m.templateButtonReplyMessage)?.selectedDisplayText) ??
    texto(obj(obj(m.listResponseMessage)?.singleSelectReply)?.selectedRowId) ??
    null
  )
}

function citadoDe(dados: Obj, m: Obj): string | null {
  for (const fonte of [obj(dados.contextInfo), obj(obj(m.extendedTextMessage)?.contextInfo), obj(obj(m.imageMessage)?.contextInfo)]) {
    const id = texto(fonte?.stanzaId)
    if (id) return id
  }
  return null
}

/** Uma mensagem recebida (messages.upsert): texto do cliente ou voto na enquete; o resto (mídia, nossas, grupo) fica de fora */
export function lerMensagem(dados: unknown, sender: string | null): EventoWebhook | null {
  const d = obj(dados)
  const key = obj(d?.key)
  const m = obj(d?.message)
  const remoteJid = texto(key?.remoteJid)
  const id = texto(key?.id)
  if (!d || !key || !m || !remoteJid || !id || key.fromMe === true || !jidDeConversa(remoteJid)) return null
  const jids = [key.remoteJid, key.remoteJidAlt, key.senderPn, key.participant, key.participantAlt].map(texto).filter((j): j is string => Boolean(j))
  const numero = jids.map(numeroDoJid).find(Boolean) ?? null
  const nome = texto(d.pushName)

  const voto = obj(m.pollUpdateMessage)
  if (voto) {
    const chaveEnquete = obj(voto.pollCreationMessageKey)
    const idEnquete = texto(chaveEnquete?.id)
    if (!idEnquete) return null
    const v = obj(voto.vote)
    const escolhidas = Array.isArray(v?.selectedOptions) ? (v!.selectedOptions as unknown[]) : null
    // Nomes (a Evolution abriu) ou hashes (ainda cifrado não tem selectedOptions)
    let opcoes = escolhidas && escolhidas.every((o) => typeof o === 'string') ? (escolhidas as string[]) : null
    if (!opcoes && Array.isArray(d.pollUpdates)) {
      const marcadas = (d.pollUpdates as unknown[]).map(obj).filter((p) => p && Array.isArray(p.voters) && (p.voters as unknown[]).length > 0)
      if (marcadas.length) opcoes = marcadas.map((p) => String(p!.name))
    }
    const encPayload = bytesDoWhatsapp(v?.encPayload)
    const encIv = bytesDoWhatsapp(v?.encIv)
    return {
      tipo: 'voto',
      idMensagem: id,
      idEnquete,
      numero,
      nome,
      opcoes,
      cifrado: encPayload && encIv ? { encPayload, encIv } : null,
      votantes: jids,
      criadores: [sender, texto(chaveEnquete?.remoteJid), texto(chaveEnquete?.participant)].filter((j): j is string => Boolean(j)),
    }
  }

  const corpo = textoDaMensagem(m)
  if (!corpo) return null
  return { tipo: 'texto', idMensagem: id, texto: corpo.trim().slice(0, 1000), citadoId: citadoDe(d, m), numero, nome }
}

const ESTADOS: Record<string, EstadoConexaoWhatsapp> = { open: 'conectado', connecting: 'conectando', close: 'desconectado' }

/** Corpo do webhook → instância e eventos que interessam (o resto é ignorado em silêncio) */
export function lerAvisoWebhook(corpo: unknown): AvisoWebhook {
  const c = obj(corpo)
  const instancia = texto(c?.instance) ?? texto(obj(c?.data)?.instance)
  const evento = texto(c?.event)?.toLowerCase().replace(/_/g, '.') ?? ''
  const sender = texto(c?.sender)
  const eventos: EventoWebhook[] = []
  if (evento === 'connection.update') {
    const d = obj(c?.data)
    const estado = ESTADOS[String(d?.state)]
    if (estado) eventos.push({ tipo: 'conexao', estado, numero: numeroDoJid(texto(d?.wuid)), nomePerfil: texto(d?.profileName) })
  } else if (evento === 'messages.upsert') {
    const lista = Array.isArray(c?.data) ? (c!.data as unknown[]) : [c?.data]
    for (const item of lista) {
      const e = lerMensagem(item, sender)
      if (e) eventos.push(e)
    }
  } else if (evento === 'messages.update') {
    // Formato antigo (Baileys 6): { keyId, remoteJid, fromMe, pollUpdates: [{ name, voters }] } já agregado
    const lista = Array.isArray(c?.data) ? (c!.data as unknown[]) : [c?.data]
    for (const item of lista.map(obj)) {
      if (!item || item.fromMe === true || !Array.isArray(item.pollUpdates)) continue
      const idEnquete = texto(item.keyId)
      const remoteJid = texto(item.remoteJid)
      if (!idEnquete || !remoteJid || !jidDeConversa(remoteJid)) continue
      const marcadas = (item.pollUpdates as unknown[]).map(obj).filter((p) => p && Array.isArray(p.voters) && (p.voters as unknown[]).length > 0)
      eventos.push({
        tipo: 'voto',
        idMensagem: `${idEnquete}:${marcadas.map((p) => String(p!.name)).join('|')}`,
        idEnquete,
        numero: numeroDoJid(remoteJid),
        nome: null,
        opcoes: marcadas.map((p) => String(p!.name)),
        cifrado: null,
        votantes: [remoteJid],
        criadores: [],
      })
    }
  }
  return { instancia, eventos }
}

// ─── Endereço e segredo ───

/** Segredo do servidor: WHATSAPP_WEBHOOK_SEGREDO ou, sem ele, derivado do JWT_ACCESS_SECRET (nenhuma variável nova obrigatória) */
export function segredoDoServidor(config: { WHATSAPP_WEBHOOK_SEGREDO: string; JWT_ACCESS_SECRET: string }): string {
  return config.WHATSAPP_WEBHOOK_SEGREDO || createHmac('sha256', config.JWT_ACCESS_SECRET).update('grafygo:whatsapp:webhook').digest('hex')
}

/** Segredo do endereço de uma empresa (vazar o de uma não abre as outras) */
export function segredoDaEmpresa(segredoServidor: string, empresaId: string): string {
  return createHmac('sha256', segredoServidor).update(`empresa:${empresaId}`).digest('base64url').slice(0, 40)
}

export function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Empresa da instância "grafygo-{id}" (null se não for uma instância nossa) */
export function empresaDaInstancia(instancia: string | null): string | null {
  const m = /^grafygo-([A-Za-z0-9-]{1,64})$/.exec(instancia ?? '')
  return m ? m[1]! : null
}

/** Endereço que a Evolution chama (rede interna do compose: http://api:3333/api/v1/...) */
export function urlDoWebhook(config: { WHATSAPP_WEBHOOK_URL: string; PORT: number }, segredo: string): string {
  const base = (config.WHATSAPP_WEBHOOK_URL || `http://api:${config.PORT}${API_PREFIX}`).replace(/\/+$/, '')
  return `${base}/publico/whatsapp/webhook/${segredo}`
}
