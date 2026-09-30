import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest } from 'fastify'
import { z } from 'zod'
import { CATEGORIAS_TEMPLATE, idParamSchema, statusConfigSchema, statusQuerySchema, templateSchema } from '@onprint/shared'
import { criarConfiguracoesService } from './service'

type Service = ReturnType<typeof criarConfiguracoesService>

function criarConfiguracoesController(service: Service) {
  const autor = (request: FastifyRequest) => request.user.sub
  return {
    listarStatus: (entidade?: string) => service.listarStatus(entidade),
    atualizarStatus: (request: FastifyRequest, id: string, dados: z.output<typeof statusConfigSchema>) =>
      service.atualizarStatus(id, dados, autor(request)),
    listarTemplates: (q: { categoria?: string; ativos?: 'true' | 'false' }) =>
      service.listarTemplates({ categoria: q.categoria, somenteAtivos: q.ativos === 'true' }),
    criarTemplate: (request: FastifyRequest, dados: z.output<typeof templateSchema>) =>
      service.criarTemplate(dados, autor(request)),
    atualizarTemplate: (request: FastifyRequest, id: string, dados: z.output<typeof templateSchema>) =>
      service.atualizarTemplate(id, dados, autor(request)),
    removerTemplate: (request: FastifyRequest, id: string) => service.removerTemplate(id, autor(request)),
  }
}

/** Status do sistema e templates de mensagens (Configurações). */
export const configuracoesRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = criarConfiguracoesController(criarConfiguracoesService(app))
  const pode = (acao: 'criar' | 'editar' | 'excluir') => ({ onRequest: [app.exigirPermissao('configuracoes', acao)] })
  // Leitura aberta a qualquer usuário logado: StatusBadge e "Copiar mensagem" são usados em todo o sistema
  const logado = { onRequest: [app.autenticar] }

  app.get(
    '/status',
    { ...logado, schema: { tags: ['status'], summary: 'Status configuráveis (cor e rótulo)', querystring: statusQuerySchema } },
    (req) => c.listarStatus(req.query.entidade),
  )
  app.put(
    '/status/:id',
    { ...pode('editar'), schema: { tags: ['status'], summary: 'Atualiza rótulo, cor e ordem', params: idParamSchema, body: statusConfigSchema } },
    (req) => c.atualizarStatus(req, req.params.id, req.body),
  )

  const templatesQuery = z.object({ categoria: z.enum(CATEGORIAS_TEMPLATE).optional(), ativos: z.enum(['true', 'false']).optional() })
  app.get('/templates', { ...logado, schema: { tags: ['templates'], summary: 'Templates de mensagens', querystring: templatesQuery } }, (req) =>
    c.listarTemplates(req.query),
  )
  app.post('/templates', { ...pode('criar'), schema: { tags: ['templates'], summary: 'Cria template', body: templateSchema } }, async (req, reply) =>
    reply.status(201).send(await c.criarTemplate(req, req.body)),
  )
  app.put(
    '/templates/:id',
    { ...pode('editar'), schema: { tags: ['templates'], summary: 'Atualiza template', params: idParamSchema, body: templateSchema } },
    (req) => c.atualizarTemplate(req, req.params.id, req.body),
  )
  app.delete(
    '/templates/:id',
    { ...pode('excluir'), schema: { tags: ['templates'], summary: 'Remove template', params: idParamSchema } },
    async (req, reply) => {
      await c.removerTemplate(req, req.params.id)
      return reply.status(204).send()
    },
  )
}
