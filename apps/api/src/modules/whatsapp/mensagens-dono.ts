import type { FastifyInstance } from 'fastify'
import { GUARDA_MENSAGENS_DONO_MS } from './aprovacao'
import { ehCanalVoce } from './copiloto'
import { obterConfigWhatsapp } from './avisos'
import { numeroCanonico } from './conversas'
import { variantesDoNumero } from './respostas'
import { numeroDoJid, type EventoWebhook } from './webhook'

type EventoProprio = Extract<EventoWebhook, { tipo: 'proprio' }>

/** Texto guardado: o suficiente para o aviso "vocês conversaram: …" */
const MAX_TEXTO = 300

/**
 * Mensagens que o dono digita à mão nas conversas com clientes (celular ou WhatsApp Web): só para a aprovação segura
 * saber se "vocês conversaram depois do envio". Fica de fora a conversa "Você" e tudo o que o sistema mandou (o
 * registro dos envios em memória, mensagens_whatsapp e os avisos do Assistente). Texto curto, apagado em 30 dias.
 */
export function criarMensagensDono(app: FastifyInstance) {
  const { prisma } = app
  let ultimaLimpeza = 0

  return {
    /** Guarda a mensagem do dono na conversa com o cliente. Devolve se guardou. Nunca lança para o webhook. */
    async registrar(e: EventoProprio, sender: string | null): Promise<boolean> {
      try {
        const texto = e.texto?.trim()
        const numero = numeroCanonico(e.jids.map(numeroDoJid).find(Boolean) ?? null)
        if (!texto || !numero) return false
        const config = await obterConfigWhatsapp(prisma)
        if (ehCanalVoce(e.jids, { numero: config.numero, lid: config.lid, sender })) return false
        if (app.whatsapp.registroEnvios.ehDoSistema({ idMensagem: e.idMensagem, numero, texto })) return false
        const [doSistema, doAssistente] = await Promise.all([
          prisma.mensagemWhatsapp.findFirst({ where: { idExterno: e.idMensagem }, select: { id: true } }),
          prisma.mensagemVoceWhatsapp.findUnique({ where: { idExterno: e.idMensagem }, select: { id: true } }),
        ])
        if (doSistema || doAssistente) return false
        const { count } = await prisma.mensagemDonoWhatsapp.createMany({ data: [{ idExterno: e.idMensagem, numero, texto: texto.slice(0, MAX_TEXTO) }], skipDuplicates: true })
        // Privacidade: o que passou de 30 dias sai (no máximo uma vez por hora)
        if (Date.now() - ultimaLimpeza > 3_600_000) {
          ultimaLimpeza = Date.now()
          await prisma.mensagemDonoWhatsapp.deleteMany({ where: { enviadaEm: { lt: new Date(Date.now() - GUARDA_MENSAGENS_DONO_MS) } } })
        }
        return count === 1
      } catch (erro) {
        app.log.warn({ err: erro }, 'Mensagem do dono na conversa não registrada')
        return false
      }
    },

    /** O que o dono escreveu a esse número depois de `desde` (com e sem o 9º dígito) */
    depois(numero: string, desde: Date) {
      return prisma.mensagemDonoWhatsapp.findMany({
        where: { numero: { in: variantesDoNumero(numeroCanonico(numero) ?? numero) }, enviadaEm: { gt: desde } },
        orderBy: { enviadaEm: 'asc' },
        take: 20,
        select: { texto: true, enviadaEm: true },
      })
    },
  }
}
