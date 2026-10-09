import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  aprovacaoInternaSchema,
  conversaoSchema,
  descartarSolicitacaoSchema,
  idParamSchema,
  orcamentoSchema,
  orcamentosQuerySchema,
  recusaSchema,
  solicitacaoSchema,
  solicitacoesQuerySchema,
  statusPersonalizadoSchema,
} from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { validarStatusPersonalizado } from '../../core/status-personalizado'
import { analiseOrcamentoSchema } from './analise'
import { criarCatalogoService } from './catalogo.service'
import { criarOrcamentosController } from './controller'
import { criarConversaoService } from './conversao.service'
import { criarOrcamentosService } from './orcamentos.service'
import { criarSolicitacoesService } from './solicitacoes.service'

export const orcamentosRoutes: FastifyPluginAsyncZod = async (app) => {
  const orcamentos = criarOrcamentosService(app)
  const c = criarOrcamentosController(app, {
    orcamentos,
    solicitacoes: criarSolicitacoesService(app),
    conversao: criarConversaoService(app, orcamentos),
    catalogo: criarCatalogoService(app),
  })
  const pode = (acao: 'visualizar' | 'criar' | 'editar') => ({ onRequest: [app.exigirPermissao('orcamentos', acao)] })

  // ── Solicitações ──
  const tagsS = ['solicitacoes']
  app.get('/solicitacoes', { ...pode('visualizar'), schema: { tags: tagsS, summary: 'Lista solicitações', querystring: solicitacoesQuerySchema } }, (req) =>
    c.listarSolicitacoes(req, req.query),
  )
  app.get('/solicitacoes/:id', { ...pode('visualizar'), schema: { tags: tagsS, summary: 'Detalhe da solicitação', params: idParamSchema } }, (req) =>
    c.obterSolicitacao(req, req.params.id),
  )
  app.post(
    '/solicitacoes',
    { ...pode('criar'), schema: { tags: tagsS, summary: 'Cria solicitação (com pré-cadastro opcional)', body: solicitacaoSchema } },
    async (req, reply) => reply.status(201).send(await c.criarSolicitacao(req, req.body)),
  )
  app.post('/solicitacoes/:id/assumir', { ...pode('editar'), schema: { tags: tagsS, summary: 'Assume o atendimento', params: idParamSchema } }, (req) =>
    c.assumirSolicitacao(req, req.params.id),
  )
  app.post(
    '/solicitacoes/:id/descartar',
    { ...pode('editar'), schema: { tags: tagsS, summary: 'Descarta a solicitação', params: idParamSchema, body: descartarSolicitacaoSchema } },
    (req) => c.descartarSolicitacao(req, req.params.id, req.body.motivo),
  )

  // ── Catálogo para orçar (sem precisar do módulo Produtos) ──
  app.get(
    '/orcamentos/catalogo',
    { ...pode('visualizar'), schema: { tags: ['orcamentos'], summary: 'Busca produtos para orçar', querystring: z.object({ busca: z.string().trim().optional() }) } },
    (req) => c.buscarCatalogo(req, req.query.busca),
  )
  app.get(
    '/orcamentos/catalogo/:id',
    { ...pode('visualizar'), schema: { tags: ['orcamentos'], summary: 'Produto com acabamentos para orçar', params: idParamSchema } },
    (req) => c.obterDoCatalogo(req, req.params.id),
  )

  // ── Orçamentos ──
  const tags = ['orcamentos']
  app.get('/orcamentos', { ...pode('visualizar'), schema: { tags, summary: 'Lista orçamentos (só os próprios sem "ver todos")', querystring: orcamentosQuerySchema } }, (req) =>
    c.listar(req, req.query),
  )
  app.get('/orcamentos/:id', { ...pode('visualizar'), schema: { tags, summary: 'Orçamento com itens e pedido gerado', params: idParamSchema } }, (req) =>
    c.obter(req, req.params.id),
  )
  app.post('/orcamentos', { ...pode('criar'), schema: { tags, summary: 'Cria orçamento (a API recalcula tudo)', body: orcamentoSchema } }, async (req, reply) =>
    reply.status(201).send(await c.criar(req, req.body)),
  )
  // Semáforo ao vivo no editor: quem cria OU edita orçamentos (sem custos para quem não os vê)
  app.post(
    '/orcamentos/analisar',
    {
      onRequest: [
        app.exigirPermissao('orcamentos', 'visualizar'),
        async (req) => {
          if (!(await app.temPermissao(req, 'orcamentos', 'criar')) && !(await app.temPermissao(req, 'orcamentos', 'editar'))) throw AppError.semPermissao()
        },
      ],
      schema: { tags, summary: 'Lucro (semáforo) dos itens antes de salvar', body: analiseOrcamentoSchema },
    },
    (req) => c.analisar(req, req.body),
  )
  app.put(
    '/orcamentos/:id',
    { ...pode('editar'), schema: { tags, summary: 'Atualiza orçamento aberto (itens substituídos)', params: idParamSchema, body: orcamentoSchema } },
    (req) => c.atualizar(req, req.params.id, req.body),
  )
  app.post('/orcamentos/:id/enviar', { ...pode('editar'), schema: { tags, summary: 'Marca como enviado', params: idParamSchema } }, (req) => c.enviar(req, req.params.id))
  app.post('/orcamentos/:id/negociacao', { ...pode('editar'), schema: { tags, summary: 'Marca como em negociação', params: idParamSchema } }, (req) =>
    c.negociacao(req, req.params.id),
  )
  app.post(
    '/orcamentos/:id/aprovar',
    { ...pode('editar'), schema: { tags, summary: 'Registra a aprovação do cliente (interna)', params: idParamSchema, body: aprovacaoInternaSchema } },
    (req) => c.aprovar(req, req.params.id, req.body.nome),
  )
  app.post('/orcamentos/:id/recusar', { ...pode('editar'), schema: { tags, summary: 'Registra a recusa', params: idParamSchema, body: recusaSchema } }, (req) =>
    c.recusar(req, req.params.id, req.body.motivo),
  )
  app.post('/orcamentos/:id/reabrir', { ...pode('editar'), schema: { tags, summary: 'Reabre para negociação', params: idParamSchema } }, (req) =>
    c.reabrir(req, req.params.id),
  )
  app.post(
    '/orcamentos/:id/status-personalizado',
    { ...pode('editar'), schema: { tags, summary: 'Coluna própria no kanban (status próprio da mesma base)', params: idParamSchema, body: statusPersonalizadoSchema } },
    async (req) => {
      const o = await c.obter(req, req.params.id)
      const id = await validarStatusPersonalizado(app.prisma, 'orcamento', req.body.statusPersonalizadoId, o.status)
      await app.prisma.orcamento.update({ where: { id: o.id }, data: { statusPersonalizadoId: id } })
      return c.obter(req, req.params.id)
    },
  )
  app.post('/orcamentos/:id/duplicar', { ...pode('criar'), schema: { tags, summary: 'Duplica como novo rascunho', params: idParamSchema } }, async (req, reply) =>
    reply.status(201).send(await c.duplicar(req, req.params.id)),
  )
  app.post(
    '/orcamentos/:id/converter',
    { ...pode('editar'), schema: { tags, summary: 'Converte o orçamento aprovado em pedido', params: idParamSchema, body: conversaoSchema } },
    (req) => c.converter(req, req.params.id, req.body),
  )
}
