import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import {
  criarUsuarioSchema,
  editarUsuarioSchema,
  idParamSchema,
  redefinirSenhaSchema,
  usuariosQuerySchema,
} from '@onprint/shared'
import { criarUsuariosController } from './controller'
import { criarUsuariosService } from './service'

const tags = ['usuarios']

export const usuariosRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = criarUsuariosController(criarUsuariosService(app))
  const pode = (acao: 'visualizar' | 'criar' | 'editar' | 'excluir') => ({
    onRequest: [app.exigirPermissao('usuarios', acao)],
  })

  app.get('/', { ...pode('visualizar'), schema: { tags, summary: 'Lista usuários', querystring: usuariosQuerySchema } }, (req) =>
    c.listar(req.query),
  )
  // Qualquer usuário logado: lista de nomes para campos como "vendedor responsável"
  app.get('/opcoes', { onRequest: [app.autenticar], schema: { tags, summary: 'Usuários ativos (id e nome)' } }, () =>
    c.opcoes(),
  )
  app.get('/papeis', { ...pode('visualizar'), schema: { tags, summary: 'Papéis disponíveis' } }, () => c.papeis())
  app.get('/:id', { ...pode('visualizar'), schema: { tags, summary: 'Detalhe do usuário', params: idParamSchema } }, (req) =>
    c.obter(req.params.id),
  )
  app.post('/', { ...pode('criar'), schema: { tags, summary: 'Cria usuário com senha provisória', body: criarUsuarioSchema } }, async (req, reply) =>
    reply.status(201).send(await c.criar(req, req.body)),
  )
  app.put(
    '/:id',
    { ...pode('editar'), schema: { tags, summary: 'Atualiza usuário', params: idParamSchema, body: editarUsuarioSchema } },
    (req) => c.atualizar(req, req.params.id, req.body),
  )
  app.post(
    '/:id/redefinir-senha',
    { ...pode('editar'), schema: { tags, summary: 'Define senha provisória', params: idParamSchema, body: redefinirSenhaSchema } },
    async (req, reply) => {
      await c.redefinirSenha(req, req.params.id, req.body)
      return reply.status(204).send()
    },
  )
  app.delete('/:id', { ...pode('excluir'), schema: { tags, summary: 'Desativa usuário', params: idParamSchema } }, (req) =>
    c.desativar(req, req.params.id),
  )
}
