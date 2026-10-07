import { timingSafeEqual } from 'node:crypto'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { AppError } from '../../core/AppError'
import { receberEventoAsaas } from '../../plataforma/cobrancas'

function tokenConfere(recebido: unknown, esperado: string): boolean {
  if (!esperado || typeof recebido !== 'string') return false
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Avisos dos gateways (sem login): a origem é conferida pelo token combinado com o gateway. */
export const webhooksRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/webhooks/asaas',
    { config: { rateLimit: { max: 600, timeWindow: '1 minute' } }, schema: { tags: ['plataforma'], summary: 'Webhook do Asaas (cobranças e notas fiscais)' } },
    async (request) => {
      if (!tokenConfere(request.headers['asaas-access-token'], app.config.ASAAS_WEBHOOK_TOKEN)) throw AppError.naoAutenticado('Token do webhook inválido.')
      const corpo = (request.body ?? {}) as Parameters<typeof receberEventoAsaas>[1]
      // Sempre 200 depois de guardar o aviso: falha ao aplicar fica no evento e a conferência diária corrige
      return { recebido: true, ...(await receberEventoAsaas(app, corpo)) }
    },
  )
}
