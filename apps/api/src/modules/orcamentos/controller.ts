import type { FastifyInstance, FastifyRequest } from 'fastify'
import type {
  conversaoSchema,
  orcamentoSchema,
  orcamentosQuerySchema,
  solicitacaoSchema,
  solicitacoesQuerySchema,
} from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { contextoUsuario } from '../../core/escopo'
import { comAnalise, parametrosDaEmpresaAtual, type analiseOrcamentoSchema } from './analise'
import type { criarCatalogoService } from './catalogo.service'
import type { ConversaoAutomatica } from './conversao-automatica'
import type { criarConversaoService } from './conversao.service'
import type { OrcamentosService } from './orcamentos.service'
import type { criarSolicitacoesService } from './solicitacoes.service'
import { avisarOrcamento, avisarSolicitacao } from './tempo-real'

interface Servicos {
  orcamentos: OrcamentosService
  solicitacoes: ReturnType<typeof criarSolicitacoesService>
  conversao: ReturnType<typeof criarConversaoService>
  automatica: ConversaoAutomatica
  catalogo: ReturnType<typeof criarCatalogoService>
}

type ComCustos = { custoEstimado?: unknown; itens?: { custoEstimado?: unknown }[] }

/** Custo e margem do orçamento só para quem vê custos (produtos:editar). */
function ocultarCustos<T extends ComCustos>(o: T): T {
  const copia = { ...o, itens: o.itens?.map((i) => ({ ...i })) }
  delete copia.custoEstimado
  copia.itens?.forEach((i) => delete i.custoEstimado)
  return copia
}

function comMargem<T extends { total: { toString(): string }; custoEstimado: { toString(): string } }>(o: T) {
  const total = Number(o.total.toString())
  const custo = Number(o.custoEstimado.toString())
  return { ...o, margemPercentual: total > 0 ? (((total - custo) / total) * 100).toFixed(2) : null }
}

export function criarOrcamentosController(app: FastifyInstance, s: Servicos) {
  const ctx = (req: FastifyRequest) => contextoUsuario(app, req, 'orcamentos')
  const daEquipe = (req: FastifyRequest) => ({ origem: 'equipe' as const, atorId: req.user.sub })
  type Detalhe = Awaited<ReturnType<OrcamentosService['obter']>>
  type Solicitacao = Awaited<ReturnType<ReturnType<typeof criarSolicitacoesService>['obter']>>

  /** Depois do commit: avisa as telas abertas (sala "orcamentos") e devolve o detalhe */
  async function mudou(req: FastifyRequest, o: Detalhe, acao: Parameters<typeof avisarOrcamento>[2]) {
    avisarOrcamento(app, o, acao, daEquipe(req))
    return detalhe(req, o)
  }
  function solicitacaoMudou(req: FastifyRequest, s: Solicitacao, acao: Parameters<typeof avisarSolicitacao>[2]) {
    avisarSolicitacao(app, s, acao, daEquipe(req))
    return s
  }

  // Semáforo do lucro para todos; números só para quem vê custos (fase 3 da precificação)
  async function detalhe(req: FastifyRequest, o: Awaited<ReturnType<OrcamentosService['obter']>>) {
    const c = await ctx(req)
    const comLucro = comAnalise(o, await parametrosDaEmpresaAtual(app.prisma), c.veCustos)
    return c.veCustos ? comMargem(comLucro) : ocultarCustos(comLucro)
  }

  return {
    // Solicitações
    listarSolicitacoes: async (req: FastifyRequest, q: z.output<typeof solicitacoesQuerySchema>) => s.solicitacoes.listar(q, await ctx(req)),
    obterSolicitacao: async (req: FastifyRequest, id: string) => s.solicitacoes.obter(id, await ctx(req)),
    async criarSolicitacao(req: FastifyRequest, dados: z.output<typeof solicitacaoSchema>) {
      if (dados.novoCliente && !(await app.temPermissao(req, 'clientes', 'criar'))) {
        throw AppError.semPermissao('Você não pode cadastrar clientes. Selecione um cliente existente.')
      }
      return solicitacaoMudou(req, await s.solicitacoes.criar(dados, await ctx(req)), 'criada')
    },
    assumirSolicitacao: async (req: FastifyRequest, id: string) => solicitacaoMudou(req, await s.solicitacoes.assumir(id, await ctx(req)), 'assumida'),
    descartarSolicitacao: async (req: FastifyRequest, id: string, motivo: string) =>
      solicitacaoMudou(req, await s.solicitacoes.descartar(id, motivo, await ctx(req)), 'descartada'),

    // Orçamentos
    async listar(req: FastifyRequest, q: z.output<typeof orcamentosQuerySchema>) {
      const c = await ctx(req)
      const r = await s.orcamentos.listar(q, c)
      return c.veCustos ? r : { ...r, data: r.data.map(ocultarCustos) }
    },
    obter: async (req: FastifyRequest, id: string) => detalhe(req, await s.orcamentos.obter(id, await ctx(req))),
    async criar(req: FastifyRequest, d: z.output<typeof orcamentoSchema>) {
      const c = await ctx(req)
      const o = await s.orcamentos.criar(d, c)
      // Orçamento a partir de uma solicitação: ela vira "orçada"
      if (o.solicitacaoId) solicitacaoMudou(req, await s.solicitacoes.obter(o.solicitacaoId, { ...c, veTodos: true }), 'orcada')
      return mudou(req, o, 'criado')
    },
    atualizar: async (req: FastifyRequest, id: string, d: z.output<typeof orcamentoSchema>) => mudou(req, await s.orcamentos.atualizar(id, d, await ctx(req)), 'alterado'),
    enviar: async (req: FastifyRequest, id: string) => mudou(req, await s.orcamentos.marcarEnviado(id, await ctx(req)), 'enviado'),
    negociacao: async (req: FastifyRequest, id: string) => mudou(req, await s.orcamentos.emNegociacao(id, await ctx(req)), 'negociacao'),
    /** "Registrar aprovação": grava e, se a empresa deixou ligado, já vira pedido (a aprovação vale mesmo se a conversão falhar) */
    async aprovar(req: FastifyRequest, id: string, nome: string) {
      const c = await ctx(req)
      const o = await s.orcamentos.aprovarInterno(id, nome, c)
      await s.automatica.aposAprovacao(o, { ...daEquipe(req), nome })
      return detalhe(req, await s.orcamentos.obter(id, c))
    },
    recusar: async (req: FastifyRequest, id: string, motivo: string) => mudou(req, await s.orcamentos.recusar(id, motivo, await ctx(req)), 'recusado'),
    reabrir: async (req: FastifyRequest, id: string) => mudou(req, await s.orcamentos.reabrir(id, await ctx(req)), 'reaberto'),
    duplicar: async (req: FastifyRequest, id: string) => mudou(req, await s.orcamentos.duplicar(id, await ctx(req)), 'criado'),
    /** Coluna própria do kanban (status personalizado) */
    coluna: async (req: FastifyRequest, o: Detalhe) => mudou(req, o, 'coluna'),

    /** Semáforo ao vivo no editor (sem gravar; sem custos para quem não os vê) */
    analisar: async (req: FastifyRequest, d: z.output<typeof analiseOrcamentoSchema>) => s.orcamentos.analisar(d, await ctx(req)),

    async converter(req: FastifyRequest, id: string, d: z.output<typeof conversaoSchema>) {
      if (!(await app.temPermissao(req, 'pedidos', 'criar'))) throw AppError.semPermissao('Você não pode criar pedidos.')
      const c = await ctx(req)
      const pedido = await s.conversao.converter(id, d, c)
      app.tempoReal.emitir('pedidos', 'pedido:atualizado', { id: pedido.id })
      app.tempoReal.emitir('producao', 'op:atualizada', { pedidoId: pedido.id })
      return mudou(req, await s.orcamentos.obter(id, c), 'convertido')
    },

    // Catálogo
    buscarCatalogo: async (req: FastifyRequest, busca?: string) => s.catalogo.buscar(busca, (await ctx(req)).veCustos),
    obterDoCatalogo: async (req: FastifyRequest, id: string) => s.catalogo.obter(id, (await ctx(req)).veCustos),
  }
}
