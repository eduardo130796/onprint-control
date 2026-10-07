import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

const respostaSchema = z.object({
  status: z.enum(['ok', 'erro']),
  banco: z.enum(['ok', 'erro']),
  horario: z.string(),
})

/** Usado pelo healthcheck do Docker e para diagnóstico rápido. */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    // logLevel warn: o healthcheck do Docker (a cada 15 s) não polui o log
    { logLevel: 'warn', schema: { tags: ['sistema'], summary: 'Saúde da API e do banco', response: { 200: respostaSchema, 503: respostaSchema } } },
    async (_request, reply) => {
      const horario = new Date().toISOString()
      try {
        await app.plataforma.$queryRaw`SELECT 1`
        return { status: 'ok' as const, banco: 'ok' as const, horario }
      } catch (erro) {
        app.log.error({ err: erro }, 'Banco indisponível')
        return reply.status(503).send({ status: 'erro', banco: 'erro', horario })
      }
    },
  )
}
