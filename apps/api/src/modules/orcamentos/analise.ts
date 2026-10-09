import type { Prisma, PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { orcamentoItemSchema, valorMonetario, type AnaliseLucro, type ParametrosPreco } from '@onprint/shared'
import { analisarDocumento, linhasDoDetalhe, parametrosPreco } from '../produtos/custos'

/** POST /orcamentos/analisar: os mesmos itens do orçamento (+ desconto/acréscimo do cabeçalho, opcionais) */
export const analiseOrcamentoSchema = z.object({
  itens: z.array(orcamentoItemSchema).min(1, 'Adicione ao menos um item.').max(100),
  desconto: valorMonetario.default('0'),
  acrescimo: valorMonetario.default('0'),
})

type Db = PrismaClient | Prisma.TransactionClient
type Num = { toString(): string } | string | number | null | undefined

interface ItemComCusto {
  total: Num
  custoEstimado?: Num
  custoDetalhe?: unknown
  produto?: { lucroMinimo?: Num } | null
  acabamentos?: { custo?: Num }[]
}

interface DocumentoComItens {
  desconto?: Num
  acrescimo?: Num
  itens: ItemComCusto[]
}

export async function parametrosDaEmpresaAtual(db: Db): Promise<ParametrosPreco> {
  return parametrosPreco(await db.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' } }))
}

/**
 * Lucro do orçamento/pedido na resposta (fase 3 da precificação): `analise` por item e no total.
 * Todos recebem a situação (semáforo); custo, linhas (`custoDetalhe`) e custo dos acabamentos só quem vê
 * custos — o vendedor nunca recebe custo. O lucro mínimo do produto é usado e sai da resposta.
 * Precisa do `custoEstimado` dos itens: chame ANTES de ocultar os custos.
 */
export function comAnalise<T extends DocumentoComItens>(doc: T, parametros: ParametrosPreco, veCustos: boolean) {
  const a = analisarDocumento(
    doc.itens.map((i) => ({ total: i.total?.toString(), custoEstimado: i.custoEstimado?.toString() ?? '0', lucroMinimo: i.produto?.lucroMinimo?.toString() ?? null, linhas: linhasDoDetalhe(i.custoDetalhe) })),
    parametros,
    veCustos,
    { desconto: doc.desconto?.toString(), acrescimo: doc.acrescimo?.toString() },
  )
  const itens = doc.itens.map((item, indice) => {
    const copia: Record<string, unknown> & { analise: AnaliseLucro } = { ...item, analise: a.itens[indice]! }
    if (item.produto) {
      const produto = { ...item.produto }
      delete produto.lucroMinimo
      copia.produto = produto
    }
    if (!veCustos) {
      delete copia.custoEstimado
      delete copia.custoDetalhe
      if (item.acabamentos) {
        copia.acabamentos = item.acabamentos.map((ac) => {
          const semCusto = { ...ac }
          delete semCusto.custo
          return semCusto
        })
      }
    }
    return copia as Omit<T['itens'][number], 'custoEstimado' | 'custoDetalhe'> & { custoEstimado?: unknown; custoDetalhe?: unknown; analise: AnaliseLucro }
  })
  return { ...doc, itens, analise: a.total }
}
