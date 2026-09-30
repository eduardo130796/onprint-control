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
import type { criarCatalogoService } from './catalogo.service'
import type { criarConversaoService } from './conversao.service'
import type { OrcamentosService } from './orcamentos.service'
import type { criarSolicitacoesService } from './solicitacoes.service'

interface Servicos {
  orcamentos: OrcamentosService
  solicitacoes: ReturnType<typeof criarSolicitacoesService>
  conversao: ReturnType<typeof criarConversaoService>
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

  async function detalhe(req: FastifyRequest, o: Awaited<ReturnType<OrcamentosService['obter']>>) {
    return (await ctx(req)).veCustos ? comMargem(o) : ocultarCustos(o)
  }

  return {
    // Solicitações
    listarSolicitacoes: async (req: FastifyRequest, q: z.output<typeof solicitacoesQuerySchema>) => s.solicitacoes.listar(q, await ctx(req)),
    obterSolicitacao: async (req: FastifyRequest, id: string) => s.solicitacoes.obter(id, await ctx(req)),
    async criarSolicitacao(req: FastifyRequest, dados: z.output<typeof solicitacaoSchema>) {
      if (dados.novoCliente && !(await app.temPermissao(req, 'clientes', 'criar'))) {
        throw AppError.semPermissao('Você não pode cadastrar clientes. Selecione um cliente existente.')
      }
      return s.solicitacoes.criar(dados, await ctx(req))
    },
    assumirSolicitacao: async (req: FastifyRequest, id: string) => s.solicitacoes.assumir(id, await ctx(req)),
    descartarSolicitacao: async (req: FastifyRequest, id: string, motivo: string) => s.solicitacoes.descartar(id, motivo, await ctx(req)),

    // Orçamentos
    async listar(req: FastifyRequest, q: z.output<typeof orcamentosQuerySchema>) {
      const c = await ctx(req)
      const r = await s.orcamentos.listar(q, c)
      return c.veCustos ? r : { ...r, data: r.data.map(ocultarCustos) }
    },
    obter: async (req: FastifyRequest, id: string) => detalhe(req, await s.orcamentos.obter(id, await ctx(req))),
    criar: async (req: FastifyRequest, d: z.output<typeof orcamentoSchema>) => detalhe(req, await s.orcamentos.criar(d, await ctx(req))),
    atualizar: async (req: FastifyRequest, id: string, d: z.output<typeof orcamentoSchema>) =>
      detalhe(req, await s.orcamentos.atualizar(id, d, await ctx(req))),
    enviar: async (req: FastifyRequest, id: string) => detalhe(req, await s.orcamentos.marcarEnviado(id, await ctx(req))),
    negociacao: async (req: FastifyRequest, id: string) => detalhe(req, await s.orcamentos.emNegociacao(id, await ctx(req))),
    aprovar: async (req: FastifyRequest, id: string, nome: string) => detalhe(req, await s.orcamentos.aprovarInterno(id, nome, await ctx(req))),
    recusar: async (req: FastifyRequest, id: string, motivo: string) => detalhe(req, await s.orcamentos.recusar(id, motivo, await ctx(req))),
    reabrir: async (req: FastifyRequest, id: string) => detalhe(req, await s.orcamentos.reabrir(id, await ctx(req))),
    duplicar: async (req: FastifyRequest, id: string) => detalhe(req, await s.orcamentos.duplicar(id, await ctx(req))),

    async converter(req: FastifyRequest, id: string, d: z.output<typeof conversaoSchema>) {
      if (!(await app.temPermissao(req, 'pedidos', 'criar'))) throw AppError.semPermissao('Você não pode criar pedidos.')
      const c = await ctx(req)
      const pedido = await s.conversao.converter(id, d, c)
      app.tempoReal.emitir('pedidos', 'pedido:atualizado', { id: pedido.id })
      app.tempoReal.emitir('producao', 'op:atualizada', { pedidoId: pedido.id })
      return detalhe(req, await s.orcamentos.obter(id, c))
    },

    // Catálogo
    buscarCatalogo: async (req: FastifyRequest, busca?: string) => s.catalogo.buscar(busca, (await ctx(req)).veCustos),
    obterDoCatalogo: async (req: FastifyRequest, id: string) => s.catalogo.obter(id, (await ctx(req)).veCustos),
  }
}
