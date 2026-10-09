import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest } from 'fastify'
import { idParamSchema, insumoSchema, insumosQuerySchema } from '@onprint/shared'
import { criarCustosService } from '../produtos/custos.service'
import { criarInsumosService } from './service'

const tags = ['insumos']

/** Insumos e materiais: módulo Produtos (o plano Essencial não tem estoque). */
export const insumosRoutes: FastifyPluginAsyncZod = async (app) => {
  const insumos = criarInsumosService(app, criarCustosService(app))
  const pode = (acao: 'visualizar' | 'criar' | 'editar') => ({ onRequest: [app.exigirPermissao('produtos', acao)] })
  // Custo de insumo: quem edita produtos ou quem acessa o estoque (D92: lança a nota)
  const veCusto = async (req: FastifyRequest) => (await app.temPermissao(req, 'produtos', 'editar')) || (await app.temPermissao(req, 'estoque', 'visualizar'))

  // "controller": repassa query/corpo/usuário aos services
  app.get('/', { ...pode('visualizar'), schema: { tags, summary: 'Lista insumos (saldo, mínimo, onde é usado)', querystring: insumosQuerySchema } }, async (req) =>
    insumos.listar(req.query, await veCusto(req)),
  )
  app.get('/:id', { ...pode('visualizar'), schema: { tags, summary: 'Insumo com embalagem, custo médio e produtos que o usam', params: idParamSchema } }, async (req) =>
    insumos.obter(req.params.id, await veCusto(req)),
  )
  app.post('/', { ...pode('criar'), schema: { tags, summary: 'Cria insumo (custo = preço da embalagem ÷ conteúdo)', body: insumoSchema } }, async (req, reply) =>
    reply.status(201).send(await insumos.criar(req.body, req.user.sub, await veCusto(req))),
  )
  app.put('/:id', { ...pode('editar'), schema: { tags, summary: 'Atualiza insumo (recalcula os produtos que o usam)', params: idParamSchema, body: insumoSchema } }, async (req) =>
    insumos.atualizar(req.params.id, req.body, req.user.sub, await veCusto(req)),
  )
}
