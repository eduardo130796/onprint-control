import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest } from 'fastify'
import {
  cancelarPedidoSchema,
  entregaSchema,
  entregasQuerySchema,
  idParamSchema,
  pedidoAtualizacaoSchema,
  pedidoStatusSchema,
  pedidosQuerySchema,
  realizarEntregaSchema,
} from '@onprint/shared'
import { contextoUsuario } from '../../core/escopo'
import { criarArquivosService } from '../arquivos/service'
import { criarEntregasService } from './entregas.service'
import { historicoDoPedido } from './historico'
import { estornoAoCancelarPedido } from '../estoque/ganchos'
import { criarPedidosService } from './pedidos.service'

type ComItens = { itens: { custoEstimado?: unknown; artes: { miniaturaId: string | null }[] }[] }

/**
 * Saída do detalhe: custo dos itens só para quem vê custos (produtos:editar) e
 * URL assinada da miniatura de cada versão da arte (o <img> não envia o token).
 */
function formatarDetalhe<T extends ComItens>(p: T, veCustos: boolean, urlArquivo: (id: string) => string) {
  return {
    ...p,
    itens: p.itens.map((i) => ({
      ...i,
      custoEstimado: veCustos ? i.custoEstimado : undefined,
      artes: i.artes.map((a) => ({ ...a, miniaturaUrl: a.miniaturaId ? urlArquivo(a.miniaturaId) : null })),
    })),
  }
}

export const pedidosRoutes: FastifyPluginAsyncZod = async (app) => {
  const pedidos = criarPedidosService(app, estornoAoCancelarPedido)
  const entregas = criarEntregasService(app, criarArquivosService(app))
  const ctx = (req: FastifyRequest) => contextoUsuario(app, req, 'pedidos')
  const pode = (acao: 'visualizar' | 'criar' | 'editar' | 'excluir') => ({ onRequest: [app.exigirPermissao('pedidos', acao)] })
  const tags = ['pedidos']

  // "controller": lê a requisição, monta o contexto do usuário e delega aos services
  const detalhe = async (req: FastifyRequest, id: string) => {
    const c = await ctx(req)
    return formatarDetalhe(await pedidos.obter(id, c), c.veCustos, (arquivoId) => app.storage.gerarUrlTemporaria(arquivoId, 3600))
  }

  app.get('/pedidos', { ...pode('visualizar'), schema: { tags, summary: 'Lista pedidos (só os próprios sem "ver todos")', querystring: pedidosQuerySchema } }, async (req) =>
    pedidos.listar(req.query, await ctx(req)),
  )
  app.get('/pedidos/:id', { ...pode('visualizar'), schema: { tags, summary: 'Pedido com itens, artes, OPs, financeiro e entregas', params: idParamSchema } }, (req) =>
    detalhe(req, req.params.id),
  )
  app.put('/pedidos/:id', { ...pode('editar'), schema: { tags, summary: 'Atualiza previsão, prioridade, entrega e observações', params: idParamSchema, body: pedidoAtualizacaoSchema } }, async (req) => {
    await pedidos.atualizar(req.params.id, req.body, await ctx(req))
    return detalhe(req, req.params.id)
  })
  app.post('/pedidos/:id/status', { ...pode('editar'), schema: { tags, summary: 'Mudança manual de status (entrega)', params: idParamSchema, body: pedidoStatusSchema } }, async (req) => {
    await pedidos.mudarStatus(req.params.id, req.body.status, await ctx(req))
    return detalhe(req, req.params.id)
  })
  app.post('/pedidos/:id/cancelar', { ...pode('excluir'), schema: { tags, summary: 'Cancela o pedido (motivo obrigatório)', params: idParamSchema, body: cancelarPedidoSchema } }, async (req) => {
    await pedidos.cancelar(req.params.id, req.body.motivo, req.body.estornarEstoque, await ctx(req))
    return detalhe(req, req.params.id)
  })
  app.get('/pedidos/:id/historico', { ...pode('visualizar'), schema: { tags, summary: 'Linha do tempo do pedido', params: idParamSchema } }, async (req) => {
    await pedidos.obter(req.params.id, await ctx(req)) // valida o escopo
    return historicoDoPedido(app.prisma, req.params.id)
  })

  // Entregas
  const tagsE = ['entregas']
  app.get('/entregas', { ...pode('visualizar'), schema: { tags: tagsE, summary: 'Agenda de entregas', querystring: entregasQuerySchema } }, async (req) =>
    entregas.listar(req.query, await ctx(req)),
  )
  app.post('/pedidos/:id/entregas', { ...pode('editar'), schema: { tags: tagsE, summary: 'Registra entrega, retirada ou instalação', params: idParamSchema, body: entregaSchema } }, async (req, reply) =>
    reply.status(201).send(await entregas.criar(req.params.id, req.body, await ctx(req))),
  )
  app.put('/entregas/:id', { ...pode('editar'), schema: { tags: tagsE, summary: 'Atualiza a entrega', params: idParamSchema, body: entregaSchema } }, async (req) =>
    entregas.atualizar(req.params.id, req.body, await ctx(req)),
  )
  app.post('/entregas/:id/saiu', { ...pode('editar'), schema: { tags: tagsE, summary: 'Saiu para entrega (pedido em entrega)', params: idParamSchema } }, async (req) =>
    entregas.saiu(req.params.id, await ctx(req)),
  )
  app.post('/entregas/:id/realizar', { ...pode('editar'), schema: { tags: tagsE, summary: 'Entrega realizada (pedido entregue)', params: idParamSchema, body: realizarEntregaSchema } }, async (req) =>
    entregas.realizar(req.params.id, req.body, await ctx(req)),
  )
  app.post('/entregas/:id/cancelar', { ...pode('editar'), schema: { tags: tagsE, summary: 'Cancela a entrega', params: idParamSchema } }, async (req) =>
    entregas.cancelar(req.params.id, await ctx(req)),
  )
  app.post(
    '/entregas/:id/comprovante',
    { ...pode('editar'), schema: { tags: tagsE, summary: 'Envia o comprovante (multipart)', params: idParamSchema, consumes: ['multipart/form-data'] } },
    async (req) => entregas.enviarComprovante(req, req.params.id, await ctx(req)),
  )
}
