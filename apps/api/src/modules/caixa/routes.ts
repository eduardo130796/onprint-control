import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  abrirCaixaSchema,
  cancelarTituloSchema,
  fecharCaixaSchema,
  idParamSchema,
  recebimentoCaixaSchema,
  sangriaSuprimentoSchema,
  sessoesQuerySchema,
  vendaPdvSchema,
  vendasPdvQuerySchema,
} from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { criarPdvService } from './pdv.service'
import { criarSessaoService } from './sessao.service'

const tags = ['caixa']
const buscaQuery = z.object({ busca: z.string().trim().max(100).optional() })

export const caixaRoutes: FastifyPluginAsyncZod = async (app) => {
  const sessoes = criarSessaoService(app)
  const pdv = criarPdvService(app, sessoes)
  const pode = (acao: 'visualizar' | 'criar' | 'editar') => ({ onRequest: [app.exigirPermissao('caixa', acao)] })
  const veTodos = (req: Parameters<typeof app.temPermissao>[0]) => app.temPermissao(req, 'caixa', 'ver_todos')

  app.get('/caixa/atual', { ...pode('visualizar'), schema: { tags, summary: 'Caixa aberto do usuário (ou null)' } }, (req) => sessoes.atual(req.user.sub))
  app.post('/caixa/abrir', { ...pode('criar'), schema: { tags, summary: 'Abre o caixa com o troco inicial', body: abrirCaixaSchema } }, async (req, reply) =>
    reply.status(201).send(await sessoes.abrir(req.body, req.user.sub)),
  )
  app.post('/caixa/movimentos', { ...pode('criar'), schema: { tags, summary: 'Sangria ou suprimento (com motivo)', body: sangriaSuprimentoSchema } }, (req) =>
    sessoes.sangriaSuprimento(req.body, req.user.sub),
  )
  app.post('/caixa/sessoes/:id/fechar', { ...pode('criar'), schema: { tags, summary: 'Fecha o caixa com conferência por forma', params: idParamSchema, body: fecharCaixaSchema } }, async (req) =>
    sessoes.fechar(req.params.id, req.body, req.user.sub, await app.temPermissao(req, 'caixa', 'editar')),
  )
  app.get('/caixa/sessoes', { ...pode('visualizar'), schema: { tags, summary: 'Histórico de sessões', querystring: sessoesQuerySchema } }, async (req) =>
    sessoes.listar(req.query, req.user.sub, await veTodos(req)),
  )
  app.get('/caixa/sessoes/:id', { ...pode('visualizar'), schema: { tags, summary: 'Sessão com movimentos e conferência', params: idParamSchema } }, async (req) => {
    const s = await sessoes.detalhe(req.params.id)
    if (s.usuarioId !== req.user.sub && !(await veTodos(req))) throw AppError.naoEncontrado('Sessão de caixa não encontrada.')
    return s
  })

  // Apoio do PDV (sem exigir os módulos Financeiro e Produtos)
  app.get('/caixa/produtos', { ...pode('visualizar'), schema: { tags, summary: 'Produtos da grade do PDV', querystring: buscaQuery } }, (req) => pdv.produtos(req.query.busca))
  app.get('/caixa/formas', { ...pode('visualizar'), schema: { tags, summary: 'Formas de pagamento ativas' } }, () =>
    app.prisma.formaPagamento.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, tipo: true, taxaPercentual: true } }),
  )
  app.get('/caixa/contas', { ...pode('visualizar'), schema: { tags, summary: 'Contas financeiras ativas (sangria/suprimento)' } }, () =>
    app.prisma.contaFinanceira.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, tipo: true } }),
  )
  app.get('/caixa/titulos', { ...pode('criar'), schema: { tags, summary: 'Títulos a receber em aberto (recebimento no balcão)', querystring: buscaQuery } }, (req) =>
    pdv.titulosAbertos(req.query.busca),
  )
  app.post('/caixa/recebimentos', { ...pode('criar'), schema: { tags, summary: 'Recebe um título no caixa', body: recebimentoCaixaSchema } }, (req) => pdv.receber(req.body, req.user.sub))

  app.post('/caixa/vendas', { ...pode('criar'), schema: { tags, summary: 'Venda balcão (PDV)', body: vendaPdvSchema } }, async (req, reply) =>
    reply.status(201).send(await pdv.vender(req.body, req.user.sub)),
  )
  app.get('/caixa/vendas', { ...pode('visualizar'), schema: { tags, summary: 'Vendas do PDV', querystring: vendasPdvQuerySchema } }, async (req) =>
    pdv.listar(req.query, req.user.sub, await veTodos(req)),
  )
  app.get('/caixa/vendas/:id', { ...pode('visualizar'), schema: { tags, summary: 'Venda com itens e pagamentos', params: idParamSchema } }, (req) => pdv.obter(req.params.id))
  app.post('/caixa/vendas/:id/cancelar', { ...pode('editar'), schema: { tags, summary: 'Cancela venda (caixa aberto)', params: idParamSchema, body: cancelarTituloSchema } }, (req) =>
    pdv.cancelar(req.params.id, req.body.motivo, req.user.sub),
  )
}
