import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  baixaSchema,
  cadastroQuerySchema,
  calendarioQuerySchema,
  cancelarTituloSchema,
  categoriaFinanceiraSchema,
  comissoesQuerySchema,
  contaFinanceiraSchema,
  contaPagarSchema,
  contaReceberSchema,
  estornoSchema,
  fluxoQuerySchema,
  formaPagamentoSchema,
  idParamSchema,
  movimentosQuerySchema,
  pagarComissoesSchema,
  receberPedidoSchema,
  tituloAtualizacaoSchema,
  titulosQuerySchema,
} from '@onprint/shared'
import { registrarRotasCrud } from '../../core/crud-rotas'
import { criarArquivosService } from '../arquivos/service'
import { criarCadastrosFinanceiros } from './cadastros.service'
import { criarComissoesService } from './comissoes.service'
import { criarFluxoService } from './fluxo.service'
import { criarTitulosService, type TitulosService } from './titulos.service'

const tags = ['financeiro']
const movimentoParam = z.object({ id: z.string().uuid(), movimentoId: z.string().uuid() })

export const financeiroRoutes: FastifyPluginAsyncZod = async (app) => {
  const arquivos = criarArquivosService(app)
  const cadastros = criarCadastrosFinanceiros(app)
  const fluxo = criarFluxoService(app)
  const comissoes = criarComissoesService(app)
  const pode = (acao: 'visualizar' | 'criar' | 'editar' | 'excluir') => ({ onRequest: [app.exigirPermissao('financeiro', acao)] })

  // Cadastros (CRUD padrão, módulo financeiro)
  await app.register(async (r) => registrarRotasCrud(r, { modulo: 'financeiro', tags, nome: 'forma de pagamento', corpo: formaPagamentoSchema, query: cadastroQuerySchema, service: cadastros.formas }), {
    prefix: '/financeiro/formas',
  })
  await app.register(async (r) => registrarRotasCrud(r, { modulo: 'financeiro', tags, nome: 'categoria financeira', corpo: categoriaFinanceiraSchema, query: cadastroQuerySchema, service: cadastros.categorias }), {
    prefix: '/financeiro/categorias',
  })
  await app.register(async (r) => registrarRotasCrud(r, { modulo: 'financeiro', tags, nome: 'conta financeira', corpo: contaFinanceiraSchema, query: cadastroQuerySchema, service: cadastros.contas }), {
    prefix: '/financeiro/contas',
  })

  // Contas a receber e a pagar: mesmas rotas, services por tipo
  const rotasTitulos = (prefixo: string, service: TitulosService, corpoNovo: typeof contaReceberSchema | typeof contaPagarSchema) => {
    app.get(prefixo, { ...pode('visualizar'), schema: { tags, summary: `Lista ${prefixo}`, querystring: titulosQuerySchema } }, (req) => service.listar(req.query))
    app.get(`${prefixo}/:id`, { ...pode('visualizar'), schema: { tags, summary: 'Título com pagamentos', params: idParamSchema } }, (req) => service.obter(req.params.id))
    app.post(prefixo, { ...pode('criar'), schema: { tags, summary: 'Lança título (parcelado)', body: corpoNovo } }, async (req, reply) =>
      reply.status(201).send(await service.criar(req.body as z.output<typeof corpoNovo>, req.user.sub)),
    )
    app.put(`${prefixo}/:id`, { ...pode('editar'), schema: { tags, summary: 'Edita título', params: idParamSchema, body: tituloAtualizacaoSchema } }, (req) =>
      service.atualizar(req.params.id, req.body, req.user.sub),
    )
    app.post(`${prefixo}/:id/cancelar`, { ...pode('excluir'), schema: { tags, summary: 'Cancela título sem pagamento', params: idParamSchema, body: cancelarTituloSchema } }, (req) =>
      service.cancelar(req.params.id, req.body.motivo, req.user.sub),
    )
    app.post(`${prefixo}/:id/baixa`, { ...pode('editar'), schema: { tags, summary: 'Baixa parcial ou total (juros, multa, desconto)', params: idParamSchema, body: baixaSchema } }, (req) =>
      service.baixar(req.params.id, req.body, req.user.sub),
    )
    app.post(`${prefixo}/:id/movimentos/:movimentoId/estornar`, { ...pode('editar'), schema: { tags, summary: 'Estorna um pagamento do título', params: movimentoParam, body: estornoSchema } }, (req) =>
      service.estornar(req.params.id, req.params.movimentoId, req.body.motivo, req.user.sub),
    )
    app.post(`${prefixo}/:id/anexo`, { ...pode('editar'), schema: { tags, summary: 'Anexa boleto/comprovante', params: idParamSchema, consumes: ['multipart/form-data'] } }, (req) =>
      service.anexar(req, req.params.id, req.user.sub),
    )
  }
  const receber = criarTitulosService(app, 'receber', arquivos)
  rotasTitulos('/financeiro/receber', receber, contaReceberSchema)
  app.post(
    '/financeiro/receber/pedido/:id',
    { ...pode('editar'), schema: { tags, summary: 'Valor avulso do pedido: abate nas parcelas em aberto (mais antiga primeiro)', params: idParamSchema, body: receberPedidoSchema } },
    (req) => receber.receberDoPedido(req.params.id, req.body, req.user.sub),
  )
  rotasTitulos('/financeiro/pagar', criarTitulosService(app, 'pagar', arquivos), contaPagarSchema)

  app.get('/financeiro/fluxo', { ...pode('visualizar'), schema: { tags, summary: 'Fluxo de caixa realizado e previsto', querystring: fluxoQuerySchema } }, (req) => fluxo.fluxo(req.query))
  app.get('/financeiro/calendario', { ...pode('visualizar'), schema: { tags, summary: 'Calendário financeiro do mês', querystring: calendarioQuerySchema } }, (req) => fluxo.calendario(req.query.mes))
  app.get('/financeiro/movimentos', { ...pode('visualizar'), schema: { tags, summary: 'Extrato de movimentos', querystring: movimentosQuerySchema } }, (req) => fluxo.movimentos(req.query))

  app.get('/financeiro/comissoes', { ...pode('visualizar'), schema: { tags, summary: 'Comissões', querystring: comissoesQuerySchema } }, (req) => comissoes.listar(req.query))
  app.post('/financeiro/comissoes/pagar', { ...pode('editar'), schema: { tags, summary: 'Paga comissões liberadas', body: pagarComissoesSchema } }, (req) =>
    comissoes.pagar(req.body, req.user.sub),
  )
}
