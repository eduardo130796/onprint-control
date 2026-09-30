import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest } from 'fastify'
import { idParamSchema, permissoesPapelSchema } from '@onprint/shared'
import { criarPermissoesService } from './service'

const tags = ['permissoes']

function criarPermissoesController(service: ReturnType<typeof criarPermissoesService>) {
  return {
    matriz: () => service.matriz(),
    atualizar: (request: FastifyRequest, papelId: string, permissoes: string[]) =>
      service.atualizarPapel(papelId, permissoes, request.user.sub),
  }
}

export const permissoesRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = criarPermissoesController(criarPermissoesService(app))

  app.get(
    '/',
    {
      onRequest: [app.exigirPermissao('permissoes', 'visualizar')],
      schema: { tags, summary: 'Matriz papel × módulo × ação' },
    },
    () => c.matriz(),
  )
  app.put(
    '/papeis/:id',
    {
      onRequest: [app.exigirPermissao('permissoes', 'editar')],
      schema: { tags, summary: 'Substitui as permissões de um papel', params: idParamSchema, body: permissoesPapelSchema },
    },
    (req) => c.atualizar(req, req.params.id, req.body.permissoes),
  )
}
