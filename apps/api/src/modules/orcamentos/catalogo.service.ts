import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { AppError } from '../../core/AppError'

const selecionar = {
  id: true,
  codigo: true,
  nome: true,
  descricao: true,
  modoCalculo: true,
  precoVenda: true,
  precoMinimo: true,
  larguraPadrao: true,
  alturaPadrao: true,
  larguraMaxima: true,
  alturaMaxima: true,
  prazoProducaoDias: true,
  custo: true,
  acabamentos: {
    orderBy: { createdAt: 'asc' },
    select: {
      acabamentoId: true,
      obrigatorio: true,
      padrao: true,
      acabamento: { select: { id: true, nome: true, tipoCobranca: true, valor: true, custo: true, prazoAdicionalDias: true, ativo: true } },
    },
  },
} satisfies Prisma.ProdutoSelect

type ProdutoCatalogo = Prisma.ProdutoGetPayload<{ select: typeof selecionar }>

/** Remove custos para quem não pode vê-los e acabamentos desativados. */
function limpar(p: ProdutoCatalogo, veCustos: boolean) {
  const acabamentos = p.acabamentos
    .filter((a) => a.acabamento.ativo)
    .map((a) => ({ ...a, acabamento: veCustos ? a.acabamento : { ...a.acabamento, custo: undefined } }))
  return { ...p, custo: veCustos ? p.custo : undefined, acabamentos }
}

/**
 * Catálogo para montar orçamentos: acessível com a permissão de orçamentos
 * (o vendedor não precisa acessar o cadastro de produtos).
 */
export function criarCatalogoService(app: FastifyInstance) {
  const where: Prisma.ProdutoWhereInput = { ativo: true, tipo: { in: ['produto', 'servico', 'revenda'] } }

  return {
    async buscar(busca: string | undefined, veCustos: boolean) {
      const texto = busca ? { contains: busca, mode: 'insensitive' as const } : undefined
      const produtos = await app.prisma.produto.findMany({
        where: { ...where, ...(texto ? { OR: [{ nome: texto }, { codigo: texto }] } : {}) },
        select: selecionar,
        orderBy: { nome: 'asc' },
        take: 20,
      })
      return produtos.map((p) => limpar(p, veCustos))
    },

    async obter(id: string, veCustos: boolean) {
      const p = await app.prisma.produto.findFirst({ where: { ...where, id }, select: selecionar })
      if (!p) throw AppError.naoEncontrado('Produto não encontrado ou desativado.')
      return limpar(p, veCustos)
    },
  }
}
