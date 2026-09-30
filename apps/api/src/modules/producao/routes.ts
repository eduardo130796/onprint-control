import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest } from 'fastify'
import { z } from 'zod'
import { apontamentoSchema, idParamSchema, moverOpSchema, opAtualizacaoSchema, opsQuerySchema } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { contextoUsuario } from '../../core/escopo'
import { baixaAoConcluirOp } from '../estoque/ganchos'
import { criarOpsService } from './ops.service'
import { criarPcpService } from './pcp.service'

const tags = ['producao']

export const producaoRoutes: FastifyPluginAsyncZod = async (app) => {
  const ops = criarOpsService(app, baixaAoConcluirOp(app))
  const pcp = criarPcpService(app)
  const ctx = (req: FastifyRequest) => contextoUsuario(app, req, 'producao')
  const pode = (acao: 'visualizar' | 'criar' | 'editar') => ({ onRequest: [app.exigirPermissao('producao', acao)] })

  // Opções de máquina (filtros e apontamentos) para quem vê a produção ou os cadastros, sem exigir o módulo Produtos
  app.get(
    '/producao/maquinas',
    {
      onRequest: [
        app.autenticar,
        async (req) => {
          if (!(await app.temPermissao(req, 'producao', 'visualizar')) && !(await app.temPermissao(req, 'produtos', 'visualizar'))) throw AppError.semPermissao()
        },
      ],
      schema: { tags, summary: 'Máquinas ativas (id e nome)' },
    },
    () => app.prisma.maquina.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
  )
  app.get('/producao/ops', { ...pode('visualizar'), schema: { tags, summary: 'Ordens de produção (lista e kanban)', querystring: opsQuerySchema } }, (req) => ops.listar(req.query))
  app.get('/producao/ops/:id', { ...pode('visualizar'), schema: { tags, summary: 'OP com histórico de etapas e apontamentos', params: idParamSchema } }, (req) =>
    ops.obter(req.params.id),
  )
  app.post(
    '/producao/ops/:id/mover',
    { ...pode('editar'), schema: { tags, summary: 'Move a OP no kanban (histórico + tempo na etapa)', params: idParamSchema, body: moverOpSchema } },
    async (req) => ops.mover(req.params.id, req.body, await ctx(req)),
  )
  app.put(
    '/producao/ops/:id',
    { ...pode('editar'), schema: { tags, summary: 'Reprograma a OP (máquina, responsável, prioridade, datas)', params: idParamSchema, body: opAtualizacaoSchema } },
    async (req) => ops.atualizar(req.params.id, req.body, await ctx(req)),
  )
  app.post(
    '/producao/ops/:id/apontamentos',
    { ...pode('editar'), schema: { tags, summary: 'Registra apontamento de produção', params: idParamSchema, body: apontamentoSchema } },
    async (req, reply) => reply.status(201).send(await ops.criarApontamento(req.params.id, req.body, await ctx(req))),
  )
  app.delete(
    '/producao/ops/:id/apontamentos/:apontamentoId',
    { ...pode('editar'), schema: { tags, summary: 'Remove apontamento', params: z.object({ id: z.string().uuid(), apontamentoId: z.string().uuid() }) } },
    async (req, reply) => {
      await ops.removerApontamento(req.params.id, req.params.apontamentoId)
      return reply.status(204).send()
    },
  )
  app.post('/pedidos/:id/gerar-ops', { ...pode('criar'), schema: { tags, summary: 'Gera OPs para itens do pedido que ainda não têm', params: idParamSchema } }, async (req) =>
    ops.gerarParaPedido(req.params.id, await ctx(req)),
  )
  app.get('/pcp', { onRequest: [app.exigirPermissao('pcp', 'visualizar')], schema: { tags: ['pcp'], summary: 'Cockpit: carga, capacidade × demanda, gargalos e atrasos' } }, () =>
    pcp.resumo(),
  )
}
