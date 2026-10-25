import type { Prisma, PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { Decimal, ORIGENS_ORCAMENTO, normalizarDecimal, orcamentoItemSchema, valorMonetario, type AnaliseLucro, type ParametrosPreco } from '@onprint/shared'
import { analisarDocumento, linhasDoDetalhe, parametrosPreco } from '../produtos/custos'

/**
 * POST /orcamentos/analisar: os mesmos itens do orçamento (+ desconto/acréscimo do cabeçalho, opcionais) e o que as
 * regras comerciais olham (cliente, pagamento, data desejada, origem), para o lucro sair como vai ser gravado
 */
export const analiseOrcamentoSchema = z.object({
  itens: z.array(orcamentoItemSchema).min(1, 'Adicione ao menos um item.').max(100),
  desconto: valorMonetario.default('0'),
  acrescimo: valorMonetario.default('0'),
  clienteId: z.preprocess((v) => (v === '' ? null : v), z.string().uuid().nullable().optional()),
  sinalPercentual: z.union([z.string(), z.number()]).transform(normalizarDecimal).refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v)).optional(),
  parcelas: z.coerce.number().int().min(0).max(24).optional(),
  dataDesejada: z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
  origem: z.enum(ORIGENS_ORCAMENTO).optional(),
  /** Descontos sugeridos que o vendedor aplicou (ids das regras) */
  regrasAceitas: z.array(z.string().uuid()).max(50).optional(),
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
  /** Regras comerciais no orçamento (com sinal): entram como desconto ou acréscimo no lucro do total */
  ajusteRegras?: Num
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
    comAjusteDasRegras(doc),
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

/** Desconto e acréscimo do cabeçalho somados ao ajuste das regras no orçamento (negativo = desconto) */
export function comAjusteDasRegras(doc: Pick<DocumentoComItens, 'desconto' | 'acrescimo' | 'ajusteRegras'>) {
  const ajuste = new Decimal(doc.ajusteRegras?.toString() ?? '0')
  return {
    desconto: new Decimal(doc.desconto?.toString() ?? '0').plus(Decimal.max(ajuste.neg(), 0)).toFixed(2),
    acrescimo: new Decimal(doc.acrescimo?.toString() ?? '0').plus(Decimal.max(ajuste, 0)).toFixed(2),
  }
}
