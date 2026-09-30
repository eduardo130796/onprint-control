import type { Prisma } from '@prisma/client'
import { Decimal, hojeISO } from '@onprint/shared'
import type { TipoTitulo } from './baixa'

const ref = { select: { id: true, nome: true } } as const

export const incluirComum = {
  formaPagamento: ref,
  contaFinanceira: ref,
  categoria: ref,
  anexo: { select: { id: true, nomeOriginal: true } },
}

export const incluirReceber = {
  ...incluirComum,
  cliente: ref,
  pedido: { select: { id: true, numero: true, status: true } },
} satisfies Prisma.ContaReceberInclude

export const incluirPagar = { ...incluirComum, fornecedor: ref } satisfies Prisma.ContaPagarInclude

export const incluirMovimento = {
  contaFinanceira: ref,
  categoria: ref,
  formaPagamento: ref,
  usuario: ref,
  estornadoPor: { select: { id: true } },
} satisfies Prisma.MovimentoFinanceiroInclude

type Movimento = Prisma.MovimentoFinanceiroGetPayload<{ include: typeof incluirMovimento }>
export const formatarMovimento = ({ estornadoPor, ...m }: Movimento) => ({ ...m, estornado: Boolean(estornadoPor) })

type TituloBase = { valor: Prisma.Decimal; valorPago: Prisma.Decimal; vencimento: Date; status: string }

/** Saldo em aberto e atraso calculados para a tela. */
export function formatarTitulo<T extends TituloBase>(t: T, hoje = hojeISO()) {
  const saldo = new Decimal(t.valor.toString()).minus(t.valorPago.toString())
  const emAberto = !['pago', 'cancelado'].includes(t.status)
  return { ...t, saldo: saldo.toFixed(2), atrasado: emAberto && t.vencimento.toISOString().slice(0, 10) < hoje }
}

const dataBanco = (iso: string) => new Date(`${iso}T00:00:00Z`)

export interface FiltroTitulos {
  status?: string
  abertos?: 'true' | 'false'
  atrasados?: 'true' | 'false'
  de?: string
  ate?: string
  clienteId?: string
  fornecedorId?: string
  pedidoId?: string
  categoriaId?: string
  busca?: string
}

/** Filtro comum das listas de contas a receber e a pagar. */
export function whereTitulos(tipo: TipoTitulo, q: FiltroTitulos) {
  const texto = q.busca ? { contains: q.busca, mode: 'insensitive' as const } : undefined
  const abertos = { in: ['aberto', 'parcial', 'vencido'] as ('aberto' | 'parcial' | 'vencido')[] }
  return {
    ...(q.status ? { status: q.status } : q.abertos === 'true' || q.atrasados === 'true' ? { status: abertos } : {}),
    ...(q.atrasados === 'true' ? { vencimento: { lt: dataBanco(hojeISO()) } } : {}),
    ...(q.de || q.ate ? { vencimento: { ...(q.de ? { gte: dataBanco(q.de) } : {}), ...(q.ate ? { lte: dataBanco(q.ate) } : {}) } } : {}),
    ...(q.categoriaId ? { categoriaId: q.categoriaId } : {}),
    ...(tipo === 'receber'
      ? {
          ...(q.clienteId ? { clienteId: q.clienteId } : {}),
          ...(q.pedidoId ? { pedidoId: q.pedidoId } : {}),
          ...(texto ? { OR: [{ descricao: texto }, { cliente: { nome: texto } }, { pedido: { numero: texto } }] } : {}),
        }
      : {
          ...(q.fornecedorId ? { fornecedorId: q.fornecedorId } : {}),
          ...(texto ? { OR: [{ descricao: texto }, { documento: texto }, { fornecedor: { nome: texto } }] } : {}),
        }),
  }
}
