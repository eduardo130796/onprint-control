import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { idParamSchema } from '@onprint/shared'
import { criarArquivosController } from './controller'
import { criarArquivosService } from './service'

const entidade = z.enum(['cliente', 'fornecedor', 'pedido'])
const tags = ['arquivos']

export const arquivosRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = criarArquivosController(app, criarArquivosService(app))
  const autenticado = { onRequest: [app.autenticar] }

  app.post(
    '/',
    {
      ...autenticado,
      schema: {
        tags,
        summary: 'Envia um anexo (multipart, campo "arquivo")',
        consumes: ['multipart/form-data'],
        querystring: z.object({ entidade, entidadeId: z.string().uuid(), categoria: z.string().default('anexo') }),
      },
    },
    async (request, reply) => reply.status(201).send(await controller.enviar(request, request.query)),
  )

  app.get(
    '/',
    {
      ...autenticado,
      schema: { tags, summary: 'Lista arquivos de um registro', querystring: z.object({ entidade, entidadeId: z.string().uuid() }) },
    },
    (request) => controller.listar(request, request.query),
  )

  app.get(
    '/:id',
    { ...autenticado, schema: { tags, summary: 'Baixa/exibe um arquivo (verifica permissão)', params: idParamSchema } },
    (request, reply) => controller.baixar(request, reply, request.params.id),
  )

  app.get(
    '/:id/url',
    { ...autenticado, schema: { tags, summary: 'Gera URL temporária assinada (10 min)', params: idParamSchema } },
    (request) => controller.urlTemporaria(request, request.params.id),
  )

  app.delete(
    '/:id',
    { ...autenticado, schema: { tags, summary: 'Remove um arquivo', params: idParamSchema } },
    async (request, reply) => {
      await controller.remover(request, request.params.id)
      return reply.status(204).send()
    },
  )

  // Sem login: acesso por URL assinada e com validade
  app.get(
    '/publico/:token',
    { schema: { tags, summary: 'Arquivo por URL temporária', params: z.object({ token: z.string().max(300) }) } },
    (request, reply) => controller.baixarPublico(reply, request.params.token),
  )
}
