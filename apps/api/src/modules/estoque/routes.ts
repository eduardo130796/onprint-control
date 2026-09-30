import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  entradaEstoqueSchema,
  entradasQuerySchema,
  idParamSchema,
  localEstoqueSchema,
  movimentacaoManualSchema,
  movimentacoesQuerySchema,
  posicaoEstoqueQuerySchema,
} from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { criarEntradasService } from './entradas.service'
import { criarEstoqueService } from './estoque.service'
import { criarLocaisService } from './locais.service'

const tags = ['estoque']

export const estoqueRoutes: FastifyPluginAsyncZod = async (app) => {
  const estoque = criarEstoqueService(app)
  const entradas = criarEntradasService(app)
  const locais = criarLocaisService(app)
  const pode = (acao: 'visualizar' | 'criar' | 'editar' | 'aprovar') => ({ onRequest: [app.exigirPermissao('estoque', acao)] })

  // "controller": repassa query/corpo/usuário aos services
  app.get('/estoque/posicao', { ...pode('visualizar'), schema: { tags, summary: 'Estoque atual (saldo, mínimo, custo médio, situação)', querystring: posicaoEstoqueQuerySchema } }, (req) =>
    estoque.posicao(req.query),
  )
  app.get('/estoque/alertas/contagem', { ...pode('visualizar'), schema: { tags, summary: 'Quantos produtos estão abaixo do mínimo (badge do menu)' } }, () => estoque.contagemAlertas())
  app.get('/estoque/produtos/:id', { ...pode('visualizar'), schema: { tags, summary: 'Saldo por local e últimas movimentações de um produto', params: idParamSchema } }, (req) =>
    estoque.doProduto(req.params.id),
  )

  app.get('/estoque/movimentacoes', { ...pode('visualizar'), schema: { tags, summary: 'Movimentações (extrato)', querystring: movimentacoesQuerySchema } }, (req) => estoque.movimentacoes(req.query))
  app.post(
    '/estoque/movimentacoes',
    { ...pode('criar'), schema: { tags, summary: 'Saída, perda, ajuste de inventário ou transferência', body: movimentacaoManualSchema } },
    async (req, reply) => {
      // Ajuste de inventário corrige o saldo para o contado: só quem aprova
      if (req.body.tipo === 'ajuste' && !(await app.temPermissao(req, 'estoque', 'aprovar'))) {
        throw AppError.semPermissao('Só quem tem permissão de aprovar no estoque pode ajustar o inventário.')
      }
      return reply.status(201).send(await estoque.lancarManual(req.body, req.user.sub))
    },
  )

  app.get('/estoque/entradas', { ...pode('visualizar'), schema: { tags, summary: 'Entradas de estoque', querystring: entradasQuerySchema } }, (req) => entradas.listar(req.query))
  app.get('/estoque/entradas/:id', { ...pode('visualizar'), schema: { tags, summary: 'Entrada com itens', params: idParamSchema } }, (req) => entradas.obter(req.params.id))
  app.post('/estoque/entradas', { ...pode('criar'), schema: { tags, summary: 'Registra entrada (nota do fornecedor)', body: entradaEstoqueSchema } }, async (req, reply) =>
    reply.status(201).send(await entradas.criar(req.body, req.user.sub)),
  )
  // Fornecedores para a entrada, sem exigir o módulo Fornecedores (papel produção)
  app.get(
    '/estoque/fornecedores',
    { ...pode('criar'), schema: { tags, summary: 'Fornecedores ativos (id e nome) para a entrada', querystring: z.object({ busca: z.string().trim().max(100).optional() }) } },
    (req) =>
      app.prisma.fornecedor.findMany({
        where: { ativo: true, ...(req.query.busca ? { nome: { contains: req.query.busca, mode: 'insensitive' } } : {}) },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
        take: 20,
      }),
  )

  app.get('/estoque/locais', { ...pode('visualizar'), schema: { tags, summary: 'Locais de estoque' } }, () => locais.listar())
  app.post('/estoque/locais', { ...pode('editar'), schema: { tags, summary: 'Cria local de estoque', body: localEstoqueSchema } }, async (req, reply) =>
    reply.status(201).send(await locais.criar(req.body, req.user.sub)),
  )
  app.put('/estoque/locais/:id', { ...pode('editar'), schema: { tags, summary: 'Atualiza local de estoque', params: idParamSchema, body: localEstoqueSchema } }, (req) =>
    locais.atualizar(req.params.id, req.body, req.user.sub),
  )
}
