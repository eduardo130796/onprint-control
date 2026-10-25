import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { PROVEDORES_IA, assistenteConfigSchema } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { criarCentralAssistente } from './central.service'

const tags = ['plataforma']

/**
 * Central do Assistente GrafyGo no painel da plataforma (/plataforma/assistente…), só com a sessão de administrador da
 * plataforma. A chave da API entra por aqui (PUT ou "Testar") e nunca volta: as respostas trazem só "••••1234".
 */
export const assistenteCentralRoutes: FastifyPluginAsyncZod = async (app) => {
  const central = criarCentralAssistente(app)
  const protegida = { onRequest: [app.autenticarPlataforma] }

  const adminDe = async (id: string) => {
    const admin = await app.plataforma.adminPlataforma.findUnique({ where: { id }, select: { email: true } })
    if (!admin) throw AppError.naoAutenticado()
    return admin.email
  }

  app.get('/assistente', { ...protegida, schema: { tags, summary: 'Configuração do Assistente GrafyGo (sem a chave)' } }, () => central.obter())
  app.put('/assistente', { ...protegida, schema: { tags, summary: 'Salva a configuração (a chave só quando trocada; fica cifrada)', body: assistenteConfigSchema } }, async (request) =>
    central.salvar(request.body, await adminDe(request.user.sub)),
  )
  app.post(
    '/assistente/testar',
    {
      ...protegida,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags,
        summary: 'Classificação de teste (verifica a chave, o modelo e a latência)',
        body: z.object({ provedor: z.enum(PROVEDORES_IA).optional(), modelo: assistenteConfigSchema.shape.modelo.optional(), chave: assistenteConfigSchema.shape.chave }).default({}),
      },
    },
    (request) => central.testar(request.body),
  )
  app.get(
    '/assistente/uso',
    { ...protegida, schema: { tags, summary: 'Uso do mês por empresa (chamadas, tokens, custo estimado)', querystring: z.object({ mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() }) } },
    (request) => central.uso(request.query.mes),
  )
}
