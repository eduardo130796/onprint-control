import type { PrismaClient } from '@prisma/client'
import type { RecebimentosPedido } from '@onprint/shared'

/**
 * Pagamentos efetivos do pedido (para o recibo): entradas ligadas às parcelas, sem os estornos
 * e sem os pagamentos que foram estornados. Taxas de cartão são saídas e não entram.
 */
export async function recebimentosDoPedido(prisma: PrismaClient, pedidoId: string): Promise<RecebimentosPedido> {
  const [pedido, movimentos] = await Promise.all([
    prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, select: { cliente: { select: { cpfCnpj: true } } } }),
    prisma.movimentoFinanceiro.findMany({
      where: { tipo: 'entrada', contaReceber: { pedidoId }, estornoDeId: null, estornadoPor: { is: null } },
      orderBy: [{ data: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, data: true, valor: true, descricao: true, formaPagamento: { select: { nome: true } } },
    }),
  ])
  return {
    clienteDocumento: pedido.cliente.cpfCnpj,
    pagamentos: movimentos.map((m) => ({
      id: m.id,
      data: m.data.toISOString().slice(0, 10),
      valor: m.valor.toFixed(2),
      descricao: m.descricao,
      forma: m.formaPagamento?.nome ?? null,
    })),
  }
}
