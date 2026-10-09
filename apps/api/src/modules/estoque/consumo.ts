import type { Prisma } from '@prisma/client'
import { Decimal, consumoDeInsumo, consumoDoAcabamento } from '@onprint/shared'
import { quantidadeComPerda } from '../produtos/custos'
import { movimentar, type AlertaEstoque } from './movimentacao'

type Tx = Prisma.TransactionClient

/** Local da baixa automática (produção e PDV). */
export async function localPadrao(tx: Tx) {
  const local = (await tx.estoqueLocal.findFirst({ where: { padrao: true, ativo: true } })) ?? (await tx.estoqueLocal.findFirst({ where: { ativo: true }, orderBy: { createdAt: 'asc' } }))
  return local
}

/**
 * Baixa automática ao concluir a OP (seção 9), na mesma transação do movimento do kanban:
 * - cada insumo da ficha técnica/composição que controla estoque sai pela área real + perda;
 * - os insumos dos acabamentos do item (ilhós, bastão…) saem pelas medidas do item (`consumoDoAcabamento`);
 * - a quantidade produzida inclui as peças perdidas apontadas (refeitas) — fase 3 da precificação;
 * - um item de revenda/insumo vendido direto (sem ficha) baixa a própria quantidade.
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
      apontamentos: { select: { perda: true } },
      pedidoItem: {
        select: {
          acabamentos: {
            select: {
              tipoCobranca: true,
              acabamento: { select: { nome: true, insumos: { select: { quantidade: true, perdaPercentual: true, insumo: { select: { id: true, controlaEstoque: true } } }, orderBy: { ordem: 'asc' } } } },
            },
          },
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
  // Peças refeitas também gastaram material
  const quantidade = new Decimal(quantidadeComPerda(op.quantidade, op.apontamentos.map((a) => a.perda)))
  const proporcao = op.quantidade.gt(0) ? quantidade.div(op.quantidade.toString()) : new Decimal(1)
  const medidas = {
    quantidade: quantidade.toFixed(3),
    largura: op.largura?.toString(),
    altura: op.altura?.toString(),
    areaM2: new Decimal(op.areaM2.toString()).mul(proporcao).toFixed(3),
  }
  const produto = op.pedidoItem.produto
  const grupos: { motivo: string; linhas: { produtoId: string; quantidade: string }[] }[] = []
  const daFicha = produto.insumos
    .filter((i) => i.insumo.controlaEstoque)
    .map((i) => ({ produtoId: i.insumo.id, quantidade: consumoDeInsumo({ base: i.base, quantidade: i.quantidade.toString(), perdaPercentual: i.perdaPercentual.toString() }, medidas) }))
  if (produto.insumos.length === 0 && produto.controlaEstoque && ['revenda', 'insumo'].includes(produto.tipo)) {
    daFicha.push({ produtoId: produto.id, quantidade: quantidade.toFixed(3) })
  }
  grupos.push({ motivo: 'Baixa pela ficha técnica (área real + perda)', linhas: daFicha })
  const dosAcabamentos = op.pedidoItem.acabamentos.flatMap((a) =>
    a.acabamento.insumos
      .filter((i) => i.insumo.controlaEstoque)
      .map((i) => ({ produtoId: i.insumo.id, quantidade: consumoDoAcabamento({ tipoCobranca: a.tipoCobranca }, { quantidade: i.quantidade.toString(), perdaPercentual: i.perdaPercentual.toString() }, medidas) })),
  )
  grupos.push({ motivo: 'Baixa dos acabamentos (medidas reais + perda)', linhas: dosAcabamentos })

  const local = await localPadrao(tx)
  if (!local) return []
  const alertas: AlertaEstoque[] = []
  for (const g of grupos) {
    // Mesmo insumo em mais de uma linha (ex.: dois acabamentos com ilhós): uma movimentação só
    const somas = new Map<string, Decimal>()
    for (const l of g.linhas) somas.set(l.produtoId, (somas.get(l.produtoId) ?? new Decimal(0)).plus(l.quantidade))
    for (const [produtoId, qtd] of somas) {
      if (qtd.isZero()) continue
      const r = await movimentar(tx, {
        tipo: 'consumo_producao',
        produtoId,
        localId: local.id,
        quantidade: qtd.neg(),
        motivo: g.motivo,
        opId,
        pedidoId: op.pedidoId,
        usuarioId,
        permitirNegativo: true,
      })
      if (r.alerta) alertas.push(r.alerta)
    }
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
