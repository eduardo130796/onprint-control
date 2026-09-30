import type { FastifyInstance, FastifyRequest } from 'fastify'
import type {
  categoriaSchema,
  produtoAcabamentosSchema,
  produtoInsumosSchema,
  produtoProcessosSchema,
  produtoSchema,
  produtosQuerySchema,
  simulacaoSchema,
} from '@onprint/shared'
import type { z } from 'zod'
import type { criarCategoriasService } from './categorias.service'
import type { criarComposicaoService } from './composicao.service'
import type { criarPrecificacaoService } from './precificacao.service'
import type { ProdutosService } from './produtos.service'

interface Servicos {
  produtos: ProdutosService
  composicao: ReturnType<typeof criarComposicaoService>
  precificacao: ReturnType<typeof criarPrecificacaoService>
  categorias: ReturnType<typeof criarCategoriasService>
}

type ComCusto = { custo?: unknown; margem?: unknown }

/** Custo e margem só aparecem para quem pode editar produtos (seção 9: margem só com permissão). */
function ocultarCustos<T extends ComCusto>(produto: T): T {
  const copia = { ...produto }
  delete copia.custo
  delete copia.margem
  return copia
}

export function criarProdutosController(app: FastifyInstance, s: Servicos) {
  const autor = (req: FastifyRequest) => req.user.sub
  const veCustos = (req: FastifyRequest) => app.temPermissao(req, 'produtos', 'editar')

  return {
    async listar(req: FastifyRequest, q: z.output<typeof produtosQuerySchema>) {
      const r = await s.produtos.listar(q)
      return (await veCustos(req)) ? r : { ...r, data: r.data.map(ocultarCustos) }
    },

    async obter(req: FastifyRequest, id: string) {
      const p = await s.produtos.obter(id)
      if (await veCustos(req)) return p
      return { ...ocultarCustos(p), insumos: p.insumos.map((i) => ({ ...i, insumo: ocultarCustos(i.insumo) })) }
    },

    criar: (req: FastifyRequest, d: z.output<typeof produtoSchema>) => s.produtos.criar(d, autor(req)),
    atualizar: (req: FastifyRequest, id: string, d: z.output<typeof produtoSchema>) => s.produtos.atualizar(id, d, autor(req)),
    alterarAtivo: (req: FastifyRequest, id: string, ativo: boolean) => s.produtos.alterarAtivo(id, ativo, autor(req)),
    trocarImagem: (req: FastifyRequest, id: string) => s.produtos.trocarImagem(req, id, autor(req)),

    async acabamentos(req: FastifyRequest, id: string, d: z.output<typeof produtoAcabamentosSchema>) {
      await s.composicao.acabamentos(id, d.itens, autor(req))
      return this.obter(req, id)
    },
    async insumos(req: FastifyRequest, id: string, d: z.output<typeof produtoInsumosSchema>) {
      await s.composicao.insumos(id, d.itens, autor(req))
      return this.obter(req, id)
    },
    async processos(req: FastifyRequest, id: string, d: z.output<typeof produtoProcessosSchema>) {
      await s.composicao.processos(id, d.itens, autor(req))
      return this.obter(req, id)
    },

    async simular(req: FastifyRequest, id: string, d: z.output<typeof simulacaoSchema>) {
      const r = await s.precificacao.simular(id, d)
      return (await veCustos(req)) ? r : { ...r, custoTotal: null, margemPercentual: null }
    },

    listarCategorias: (ativo: 'true' | 'false' | 'todos') => s.categorias.listar(ativo),
    criarCategoria: (req: FastifyRequest, d: z.output<typeof categoriaSchema>) => s.categorias.criar(d, autor(req)),
    atualizarCategoria: (req: FastifyRequest, id: string, d: z.output<typeof categoriaSchema>) =>
      s.categorias.atualizar(id, d, autor(req)),
  }
}
