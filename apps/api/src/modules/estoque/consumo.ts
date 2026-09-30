import type { Prisma } from '@prisma/client'
import { Decimal, consumoDeInsumo } from '@onprint/shared'
import { movimentar, type AlertaEstoque } from './movimentacao'

type Tx = Prisma.TransactionClient

/** Local da baixa automática (produção e PDV). */
export async function localPadrao(tx: Tx) {
  const local = (await tx.estoqueLocal.findFirst({ where: { padrao: true, ativo: true } })) ?? (await tx.estoqueLocal.findFirst({ where: { ativo: true }, orderBy: { createdAt: 'asc' } }))
  return local
}

/**
 * Baixa automática ao concluir a OP (seção 9), na mesma transação do movimento do kanban:
 * cada insumo da ficha técnica que controla estoque sai pela área real + perda. Um item de
 * revenda/insumo vendido direto (sem ficha) baixa a própria quantidade.
 * Acontece uma única vez por OP: se a OP voltar e concluir de novo, não baixa em dobro.
 */
export async function baixarInsumosDaOp(tx: Tx, opId: string, usuarioId: string | null): Promise<AlertaEstoque[]> {
  const jaBaixou = await tx.estoqueMovimentacao.count({ where: { opId, tipo: 'consumo_producao' } })
  if (jaBaixou > 0) return []
  const op = await tx.ordemProducao.findUniqueOrThrow({
    where: { id: opId },
    select: {
      numero: true,
      pedidoId: true,
      quantidade: true,
      largura: true,
      altura: true,
      areaM2: true,
      pedidoItem: {
        select: {
          produto: {
            select: {
              id: true,
              tipo: true,
              controlaEstoque: true,
              insumos: { select: { quantidade: true, base: true, perdaPercentual: true, insumo: { select: { id: true, controlaEstoque: true } } } },
            },
          },
        },
      },
    },
  })
  const produto = op.pedidoItem.produto
  const linhas = produto.insumos
    .filter((i) => i.insumo.controlaEstoque)
    .map((i) => ({ produtoId: i.insumo.id, quantidade: consumoDeInsumo({ base: i.base, quantidade: i.quantidade.toString(), perdaPercentual: i.perdaPercentual.toString() }, {
      quantidade: op.quantidade.toString(),
      largura: op.largura?.toString(),
      altura: op.altura?.toString(),
      areaM2: op.areaM2.toString(),
    }) }))
  if (produto.insumos.length === 0 && produto.controlaEstoque && ['revenda', 'insumo'].includes(produto.tipo)) {
    linhas.push({ produtoId: produto.id, quantidade: new Decimal(op.quantidade.toString()).toFixed(3) })
  }
  if (linhas.length === 0) return []

  const local = await localPadrao(tx)
  if (!local) return []
  const alertas: AlertaEstoque[] = []
  for (const l of linhas) {
    if (new Decimal(l.quantidade).isZero()) continue
    const r = await movimentar(tx, {
      tipo: 'consumo_producao',
      produtoId: l.produtoId,
      localId: local.id,
      quantidade: new Decimal(l.quantidade).neg(),
      motivo: 'Baixa pela ficha técnica (área real + perda)',
      opId,
      pedidoId: op.pedidoId,
      usuarioId,
      permitirNegativo: true,
    })
    if (r.alerta) alertas.push(r.alerta)
  }
  return alertas
}

/**
 * Estorno no cancelamento do pedido (opcional, decidido por quem cancela): devolve ao mesmo local
 * o que a produção do pedido consumiu (ao custo médio atual), como ajuste com o motivo do estorno.
 */
export async function estornarConsumoDoPedido(tx: Tx, pedidoId: string, numero: string, usuarioId: string | null) {
  const consumos = await tx.estoqueMovimentacao.groupBy({
    by: ['produtoId', 'localId'],
    where: { pedidoId, tipo: 'consumo_producao' },
    _sum: { quantidade: true },
  })
  let itens = 0
  for (const c of consumos) {
    const devolver = new Decimal(c._sum.quantidade?.toString() ?? 0).neg()
    if (devolver.lte(0)) continue
    await movimentar(tx, {
      tipo: 'ajuste',
      produtoId: c.produtoId,
      localId: c.localId,
      quantidade: devolver,
      motivo: `Estorno do cancelamento do ${numero}`,
      pedidoId,
      usuarioId,
      verificarAlerta: false,
    })
    itens++
  }
  return itens
}
