import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  acabamentoSchema,
  cadastroQuerySchema,
  categoriaSchema,
  idParamSchema,
  maquinaSchema,
  maquinasQuerySchema,
  processoSchema,
  aplicarReajusteSchema,
  composicaoProdutoSchema,
  produtoAcabamentosSchema,
  produtoAtualizacaoSchema,
  produtoInsumosSchema,
  produtoProcessosSchema,
  produtoSchema,
  produtosQuerySchema,
  reajusteQuerySchema,
  simulacaoSchema,
} from '@onprint/shared'
import { registrarRotasCrud } from '../../core/crud-rotas'
import { criarArquivosService } from '../arquivos/service'
import { criarCadastrosProdutos } from './cadastros'
import { criarCategoriasService } from './categorias.service'
import { criarComposicaoService } from './composicao.service'
import { criarProdutosController } from './controller'
import { criarCustosService } from './custos.service'
import { criarPrecificacaoService } from './precificacao.service'
import { criarProdutosService } from './produtos.service'

/** Módulo Produtos: categorias, unidades, acabamentos, máquinas, processos e produtos. */
export const produtosRoutes: FastifyPluginAsyncZod = async (app) => {
  const custos = criarCustosService(app)
  const c = criarProdutosController(app, {
    produtos: criarProdutosService(app, criarArquivosService(app), custos),
    custos,
    composicao: criarComposicaoService(app),
    precificacao: criarPrecificacaoService(app),
    categorias: criarCategoriasService(app),
  })
  const pode = (acao: 'visualizar' | 'criar' | 'editar' | 'excluir') => ({ onRequest: [app.exigirPermissao('produtos', acao)] })
  const cadastros = criarCadastrosProdutos(app, custos)

  await app.register(
    async (r) => registrarRotasCrud(r, { modulo: 'produtos', tags: ['acabamentos'], nome: 'acabamento', corpo: acabamentoSchema, query: cadastroQuerySchema, service: cadastros.acabamentos }),
    { prefix: '/acabamentos' },
  )
  await app.register(
    async (r) => registrarRotasCrud(r, { modulo: 'produtos', tags: ['maquinas'], nome: 'máquina', corpo: maquinaSchema, query: maquinasQuerySchema, service: cadastros.maquinas }),
    { prefix: '/maquinas' },
  )
  await app.register(
    async (r) => registrarRotasCrud(r, { modulo: 'produtos', tags: ['processos'], nome: 'processo', corpo: processoSchema, query: cadastroQuerySchema, service: cadastros.processos }),
    { prefix: '/processos' },
  )

  // Unidades de medida (tabela de referência mantida pelo seed)
  app.get('/unidades-medida', { onRequest: [app.autenticar], schema: { tags: ['produtos'], summary: 'Unidades de medida' } }, () =>
    app.prisma.unidadeMedida.findMany({ where: { ativo: true }, select: { id: true, sigla: true, nome: true }, orderBy: { nome: 'asc' } }),
  )

  // Categorias (árvore)
  const tagsCat = ['categorias']
  app.get(
    '/categorias',
    { ...pode('visualizar'), schema: { tags: tagsCat, summary: 'Todas as categorias com caminho', querystring: z.object({ ativo: z.enum(['true', 'false', 'todos']).default('todos') }) } },
    (req) => c.listarCategorias(req.query.ativo),
  )
  app.post('/categorias', { ...pode('criar'), schema: { tags: tagsCat, summary: 'Cria categoria', body: categoriaSchema } }, async (req, reply) =>
    reply.status(201).send(await c.criarCategoria(req, req.body)),
  )
  app.put(
    '/categorias/:id',
    { ...pode('editar'), schema: { tags: tagsCat, summary: 'Atualiza categoria (inclusive ativar/desativar)', params: idParamSchema, body: categoriaSchema } },
    (req) => c.atualizarCategoria(req, req.params.id, req.body),
  )

  // Produtos
  const tags = ['produtos']
  app.get('/produtos', { ...pode('visualizar'), schema: { tags, summary: 'Lista produtos e serviços', querystring: produtosQuerySchema } }, (req) =>
    c.listar(req, req.query),
  )
  app.get('/produtos/:id', { ...pode('visualizar'), schema: { tags, summary: 'Produto com acabamentos, ficha técnica e processos', params: idParamSchema } }, (req) =>
    c.obter(req, req.params.id),
  )
  app.post('/produtos', { ...pode('criar'), schema: { tags, summary: 'Cria produto (código automático se vazio)', body: produtoSchema } }, async (req, reply) =>
    reply.status(201).send(await c.criar(req, req.body)),
  )
  app.put('/produtos/:id', { ...pode('editar'), schema: { tags, summary: 'Atualiza produto', params: idParamSchema, body: produtoAtualizacaoSchema } }, (req) =>
    c.atualizar(req, req.params.id, req.body),
  )
  app.delete('/produtos/:id', { ...pode('excluir'), schema: { tags, summary: 'Desativa produto', params: idParamSchema } }, (req) =>
    c.alterarAtivo(req, req.params.id, false),
  )
  app.post('/produtos/:id/reativar', { ...pode('editar'), schema: { tags, summary: 'Reativa produto', params: idParamSchema } }, (req) =>
    c.alterarAtivo(req, req.params.id, true),
  )
  app.post(
    '/produtos/:id/imagem',
    { ...pode('editar'), schema: { tags, summary: 'Envia a imagem do produto (multipart)', params: idParamSchema, consumes: ['multipart/form-data'] } },
    (req) => c.trocarImagem(req, req.params.id),
  )
  app.put(
    '/produtos/:id/acabamentos',
    { ...pode('editar'), schema: { tags, summary: 'Substitui os acabamentos do produto', params: idParamSchema, body: produtoAcabamentosSchema } },
    (req) => c.acabamentos(req, req.params.id, req.body),
  )
  app.put(
    '/produtos/:id/insumos',
    { ...pode('editar'), schema: { tags, summary: 'Substitui a ficha técnica', params: idParamSchema, body: produtoInsumosSchema } },
    (req) => c.insumos(req, req.params.id, req.body),
  )
  app.put(
    '/produtos/:id/processos',
    { ...pode('editar'), schema: { tags, summary: 'Substitui o roteiro de processos', params: idParamSchema, body: produtoProcessosSchema } },
    (req) => c.processos(req, req.params.id, req.body),
  )

  // Composição de custo e preço (docs/PRECIFICACAO.md)
  app.get(
    '/produtos/:id/composicao',
    { ...pode('editar'), schema: { tags, summary: 'Composição de custo, custo de referência, lucro e preço sugerido', params: idParamSchema } },
    (req) => c.obterComposicao(req.params.id),
  )
  app.put(
    '/produtos/:id/composicao',
    { ...pode('editar'), schema: { tags, summary: 'Salva modo de custo, materiais, produção, extras, lucro e preço (recalcula)', params: idParamSchema, body: composicaoProdutoSchema } },
    (req) => c.salvarComposicao(req, req.params.id, req.body),
  )
  app.get(
    '/produtos/reajuste',
    { ...pode('editar'), schema: { tags, summary: 'Produtos abaixo do lucro mínimo (ou todos) com o preço sugerido', querystring: reajusteQuerySchema } },
    (req) => c.listarReajuste(req.query.situacao),
  )
  app.post('/produtos/reajuste', { ...pode('editar'), schema: { tags, summary: 'Aplica os preços escolhidos', body: aplicarReajusteSchema } }, (req) =>
    c.aplicarReajuste(req, req.body),
  )

  app.post(
    '/produtos/:id/simular',
    // Só calcula, não grava: continua liberado no modo só leitura da assinatura
    { ...pode('visualizar'), config: { semEscrita: true }, schema: { tags, summary: 'Calcula o preço na API (motor compartilhado)', params: idParamSchema, body: simulacaoSchema } },
    (req) => c.simular(req, req.params.id, req.body),
  )
}
