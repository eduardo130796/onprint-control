import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { clienteSchema, clientesQuerySchema, contatoSchema, enderecoSchema, idParamSchema } from '@onprint/shared'
import { criarClientesController } from './controller'
import { criarClientesService } from './service'

const tags = ['clientes']
const subParams = z.object({ id: z.string().uuid(), subId: z.string().uuid() })

export const clientesRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = criarClientesController(criarClientesService(app))
  const pode = (acao: 'visualizar' | 'criar' | 'editar' | 'excluir') => ({
    onRequest: [app.exigirPermissao('clientes', acao)],
  })

  app.get('/', { ...pode('visualizar'), schema: { tags, summary: 'Lista clientes', querystring: clientesQuerySchema } }, (req) =>
    c.listar(req.query),
  )
  app.get('/:id', { ...pode('visualizar'), schema: { tags, summary: 'Ficha do cliente', params: idParamSchema } }, (req) =>
    c.obter(req.params.id),
  )
  app.post('/', { ...pode('criar'), schema: { tags, summary: 'Cria cliente (ou pré-cadastro)', body: clienteSchema } }, async (req, reply) =>
    reply.status(201).send(await c.criar(req, req.body)),
  )
  app.put(
    '/:id',
    { ...pode('editar'), schema: { tags, summary: 'Atualiza cliente', params: idParamSchema, body: clienteSchema } },
    (req) => c.atualizar(req, req.params.id, req.body),
  )
  app.delete('/:id', { ...pode('excluir'), schema: { tags, summary: 'Desativa cliente (exclusão lógica)', params: idParamSchema } }, (req) =>
    c.desativar(req, req.params.id),
  )
  app.post('/:id/reativar', { ...pode('editar'), schema: { tags, summary: 'Reativa cliente', params: idParamSchema } }, (req) =>
    c.reativar(req, req.params.id),
  )

  // Endereços
  app.post(
    '/:id/enderecos',
    { ...pode('editar'), schema: { tags, summary: 'Adiciona endereço', params: idParamSchema, body: enderecoSchema } },
    async (req, reply) => reply.status(201).send(await c.criarEndereco(req, req.params.id, req.body)),
  )
  app.put(
    '/:id/enderecos/:subId',
    { ...pode('editar'), schema: { tags, summary: 'Atualiza endereço', params: subParams, body: enderecoSchema } },
    (req) => c.atualizarEndereco(req, req.params.id, req.params.subId, req.body),
  )
  app.delete(
    '/:id/enderecos/:subId',
    { ...pode('editar'), schema: { tags, summary: 'Remove endereço', params: subParams } },
    async (req, reply) => {
      await c.removerEndereco(req, req.params.id, req.params.subId)
      return reply.status(204).send()
    },
  )

  // Contatos
  app.post(
    '/:id/contatos',
    { ...pode('editar'), schema: { tags, summary: 'Adiciona contato', params: idParamSchema, body: contatoSchema } },
    async (req, reply) => reply.status(201).send(await c.criarContato(req, req.params.id, req.body)),
  )
  app.put(
    '/:id/contatos/:subId',
    { ...pode('editar'), schema: { tags, summary: 'Atualiza contato', params: subParams, body: contatoSchema } },
    (req) => c.atualizarContato(req, req.params.id, req.params.subId, req.body),
  )
  app.delete(
    '/:id/contatos/:subId',
    { ...pode('editar'), schema: { tags, summary: 'Remove contato', params: subParams } },
    async (req, reply) => {
      await c.removerContato(req, req.params.id, req.params.subId)
      return reply.status(204).send()
    },
  )
}
