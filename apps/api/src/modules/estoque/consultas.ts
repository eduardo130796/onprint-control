import type { Prisma } from '@prisma/client'
import { Decimal, situacaoEstoque } from '@onprint/shared'

const produtoRef = { select: { id: true, codigo: true, nome: true, tipo: true, unidadeMedida: { select: { sigla: true } } } } as const

export const incluirMovimentacao = {
  produto: produtoRef,
  local: { select: { id: true, nome: true } },
  op: { select: { id: true, numero: true } },
  pedido: { select: { id: true, numero: true } },
  fornecedor: { select: { id: true, nome: true } },
  entrada: { select: { id: true, numero: true } },
  usuario: { select: { id: true, nome: true } },
} satisfies Prisma.EstoqueMovimentacaoInclude

type ProdutoRef = { id: string; codigo: string; nome: string; tipo: string; unidadeMedida: { sigla: string } | null }
type MovComRelacoes = Prisma.EstoqueMovimentacaoGetPayload<{ include: typeof incluirMovimentacao }>

export const formatarProdutoRef = ({ unidadeMedida, ...p }: ProdutoRef) => ({ ...p, unidade: unidadeMedida?.sigla ?? null })

export const formatarMovimentacao = ({ produto, ...m }: MovComRelacoes) => ({ ...m, produto: formatarProdutoRef(produto) })

export { produtoRef }

type SaldoLinha = { quantidade: Prisma.Decimal; custoMedio: Prisma.Decimal; local: { id: string; nome: string } }

/** Soma os saldos dos locais; custo médio ponderado pelos saldos positivos. */
export function consolidar(saldos: SaldoLinha[], estoqueMinimo: Prisma.Decimal) {
  let total = new Decimal(0)
  let valor = new Decimal(0)
  let positivo = new Decimal(0)
  let ultimoCusto = new Decimal(0)
  for (const s of saldos) {
    const q = new Decimal(s.quantidade.toString())
    const c = new Decimal(s.custoMedio.toString())
    total = total.plus(q)
    if (c.gt(0)) ultimoCusto = c
    if (q.gt(0)) {
      positivo = positivo.plus(q)
      valor = valor.plus(q.mul(c))
    }
  }
  const custoMedio = positivo.gt(0) ? valor.div(positivo) : ultimoCusto
  return {
    saldo: total.toFixed(3),
    custoMedio: custoMedio.toDecimalPlaces(4).toFixed(4),
    valorEstoque: valor.toDecimalPlaces(2).toFixed(2),
    situacao: situacaoEstoque(total, estoqueMinimo.toString()),
  }
}
