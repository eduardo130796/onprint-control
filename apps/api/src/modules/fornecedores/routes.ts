import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { fornecedorSchema, fornecedoresQuerySchema, idParamSchema } from '@onprint/shared'
import { criarFornecedoresController } from './controller'
import { criarFornecedoresService } from './service'

const tags = ['fornecedores']

export const fornecedoresRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = criarFornecedoresController(criarFornecedoresService(app))
  const pode = (acao: 'visualizar' | 'criar' | 'editar' | 'excluir') => ({
    onRequest: [app.exigirPermissao('fornecedores', acao)],
  })

  app.get('/', { ...pode('visualizar'), schema: { tags, summary: 'Lista fornecedores', querystring: fornecedoresQuerySchema } }, (req) =>
    c.listar(req.query),
  )
  app.get('/:id', { ...pode('visualizar'), schema: { tags, summary: 'Detalhe do fornecedor', params: idParamSchema } }, (req) =>
    c.obter(req.params.id),
  )
  app.post('/', { ...pode('criar'), schema: { tags, summary: 'Cria fornecedor', body: fornecedorSchema } }, async (req, reply) =>
    reply.status(201).send(await c.criar(req, req.body)),
  )
  app.put(
    '/:id',
    { ...pode('editar'), schema: { tags, summary: 'Atualiza fornecedor', params: idParamSchema, body: fornecedorSchema } },
    (req) => c.atualizar(req, req.params.id, req.body),
  )
  app.delete('/:id', { ...pode('excluir'), schema: { tags, summary: 'Desativa fornecedor', params: idParamSchema } }, (req) =>
    c.desativar(req, req.params.id),
  )
  app.post('/:id/reativar', { ...pode('editar'), schema: { tags, summary: 'Reativa fornecedor', params: idParamSchema } }, (req) =>
    c.reativar(req, req.params.id),
  )
}
