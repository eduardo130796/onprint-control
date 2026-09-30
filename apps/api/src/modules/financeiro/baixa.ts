import type { Prisma } from '@prisma/client'
import { Decimal, aplicarBaixa, formatarMoeda, hojeISO, statusFinanceiroPedido, statusTitulo, taxaDaForma, type StatusConta } from '@onprint/shared'
import { AppError } from '../../core/AppError'

type Tx = Prisma.TransactionClient
export type TipoTitulo = 'receber' | 'pagar'

const dataBanco = (iso: string) => new Date(`${iso}T00:00:00Z`)
const iso = (d: Date) => d.toISOString().slice(0, 10)

export async function categoriaPorCodigo(tx: Tx, codigo: string) {
  return (await tx.categoriaFinanceira.findUnique({ where: { codigo }, select: { id: true } }))?.id ?? null
}

/** Mudanças que precisam de aviso depois do commit. */
export interface EfeitosFinanceiros {
  pedidoId: string | null
  comissaoLiberadaPara: string[]
}

/**
 * Status financeiro do pedido pelos títulos (pendente → parcial → pago). Ao ficar "pago",
 * as comissões previstas são liberadas (seção 9); se deixar de estar pago, voltam a previstas.
 */
export async function sincronizarFinanceiroPedido(tx: Tx, pedidoId: string): Promise<string[]> {
  const pedido = await tx.pedido.findUniqueOrThrow({
    where: { id: pedidoId },
    select: { numero: true, statusFinanceiro: true, contasReceber: { select: { valor: true, valorPago: true, status: true } } },
  })
  const novo = statusFinanceiroPedido(pedido.contasReceber.map((c) => ({ valor: c.valor.toString(), valorPago: c.valorPago.toString(), status: c.status })))
  const valorPago = pedido.contasReceber.filter((c) => c.status !== 'cancelado').reduce((s, c) => s.plus(c.valorPago.toString()), new Decimal(0))
  await tx.pedido.update({ where: { id: pedidoId }, data: { statusFinanceiro: novo, valorPago: valorPago.toFixed(2) } })
  if (novo === pedido.statusFinanceiro) return []

  if (novo === 'pago') {
    const comissoes = await tx.comissao.findMany({ where: { pedidoId, status: 'prevista' } })
    for (const c of comissoes) {
      await tx.comissao.update({ where: { id: c.id }, data: { status: 'liberada', liberadaEm: new Date() } })
      await tx.notificacao.create({
        data: { usuarioId: c.vendedorId, titulo: `Comissão liberada: ${pedido.numero}`, mensagem: `${formatarMoeda(c.valor.toString())} disponível para pagamento.`, link: '/financeiro/comissoes' },
      })
    }
    return comissoes.map((c) => c.vendedorId)
  }
  if (pedido.statusFinanceiro === 'pago') await tx.comissao.updateMany({ where: { pedidoId, status: 'liberada' }, data: { status: 'prevista', liberadaEm: null } })
  return []
}

export interface NovaBaixa {
  tipo: TipoTitulo
  tituloId: string
  valorRecebido: string
  juros: string
  multa: string
  desconto: string
  data: string
  formaPagamentoId: string
  contaFinanceiraId?: string | null
  observacao?: string | null
  usuarioId: string | null
  caixaSessaoId?: string | null
  /** Conta usada quando a forma não define uma (ex.: conta do caixa aberto) */
  contaPadrao?: string | null
}

const delegate = (tx: Tx, tipo: TipoTitulo) => (tipo === 'receber' ? tx.contaReceber : tx.contaPagar) as unknown as Tx['contaPagar']

/**
 * Baixa parcial ou total (seção 9): grava o movimento realizado (principal + juros + multa − desconto),
 * atualiza o título e, se for título de pedido, o status financeiro do pedido. Cartão: a taxa vira despesa.
 */
export async function baixarTitulo(tx: Tx, b: NovaBaixa): Promise<{ movimentoId: string; efeitos: EfeitosFinanceiros }> {
  // Trava o título até o commit (duas baixas simultâneas não passam do saldo)
  const tabela = b.tipo === 'receber' ? 'contas_receber' : 'contas_pagar'
  await tx.$queryRawUnsafe(`SELECT id FROM ${tabela} WHERE id = $1::uuid FOR UPDATE`, b.tituloId)
  const titulo = (await delegate(tx, b.tipo).findUnique({ where: { id: b.tituloId } })) as unknown as {
    id: string; descricao: string; valor: Prisma.Decimal; valorPago: Prisma.Decimal; juros: Prisma.Decimal; multa: Prisma.Decimal; desconto: Prisma.Decimal
    vencimento: Date; status: StatusConta; categoriaId: string | null; pedidoId?: string | null
  } | null
  if (!titulo) throw AppError.naoEncontrado('Título não encontrado.')
  if (titulo.status === 'cancelado') throw AppError.regraNegocio('Título cancelado não recebe baixa.')
  const r = aplicarBaixa({ valor: titulo.valor.toString(), valorPago: titulo.valorPago.toString() }, b)
  if (!r.ok) throw AppError.regraNegocio(r.erro)

  const forma = await tx.formaPagamento.findUnique({ where: { id: b.formaPagamentoId } })
  if (!forma?.ativo) throw AppError.regraNegocio('Forma de pagamento inválida.')
  const contaId = b.contaFinanceiraId ?? forma.contaFinanceiraId ?? b.contaPadrao
  if (!contaId) throw AppError.regraNegocio('Escolha a conta financeira da baixa.')

  const categoriaId = titulo.categoriaId ?? (await categoriaPorCodigo(tx, b.tipo === 'receber' ? 'vendas' : 'outras_despesas'))
  const mov = await tx.movimentoFinanceiro.create({
    data: {
      tipo: b.tipo === 'receber' ? 'entrada' : 'saida',
      valor: b.valorRecebido,
      data: dataBanco(b.data),
      descricao: titulo.descricao,
      contaFinanceiraId: contaId,
      categoriaId,
      formaPagamentoId: forma.id,
      ...(b.tipo === 'receber' ? { contaReceberId: titulo.id } : { contaPagarId: titulo.id }),
      caixaSessaoId: b.caixaSessaoId ?? null,
      principal: r.principal,
      juros: b.juros,
      multa: b.multa,
      desconto: b.desconto,
      usuarioId: b.usuarioId,
    },
  })
  if (b.tipo === 'receber') await registrarTaxa(tx, mov.id, forma, b.valorRecebido, contaId, b.data, titulo.descricao, b.usuarioId)

  const valorPago = new Decimal(r.valorPago)
  await delegate(tx, b.tipo).update({
    where: { id: titulo.id },
    data: {
      valorPago: valorPago.toFixed(2),
      juros: new Decimal(titulo.juros.toString()).plus(b.juros).toFixed(2),
      multa: new Decimal(titulo.multa.toString()).plus(b.multa).toFixed(2),
      desconto: new Decimal(titulo.desconto.toString()).plus(b.desconto).toFixed(2),
      status: statusTitulo(titulo.valor.toString(), valorPago, iso(titulo.vencimento), hojeISO()),
      pagoEm: r.quitado ? dataBanco(b.data) : null,
      formaPagamentoId: forma.id,
      contaFinanceiraId: contaId,
      ...(b.observacao ? { observacao: b.observacao } : {}),
    },
  })
  const pedidoId = titulo.pedidoId ?? null
  const comissaoLiberadaPara = pedidoId ? await sincronizarFinanceiroPedido(tx, pedidoId) : []
  return { movimentoId: mov.id, efeitos: { pedidoId, comissaoLiberadaPara } }
}

/** Taxa da operadora (cartão etc.) como despesa ligada ao movimento que a gerou. */
export async function registrarTaxa(
  tx: Tx,
  movimentoId: string,
  forma: { nome: string; taxaPercentual: Prisma.Decimal },
  valor: string,
  contaId: string,
  data: string,
  descricao: string,
  usuarioId: string | null,
) {
  const taxa = taxaDaForma(valor, forma.taxaPercentual.toString())
  if (new Decimal(taxa).lte(0)) return
  await tx.movimentoFinanceiro.create({
    data: {
      tipo: 'saida',
      valor: taxa,
      data: dataBanco(data),
      descricao: `Taxa ${forma.nome} · ${descricao}`,
      contaFinanceiraId: contaId,
      categoriaId: await categoriaPorCodigo(tx, 'taxas_cartao'),
      baixaDeId: movimentoId,
      usuarioId,
    },
  })
}

/**
 * Estorno de um movimento (baixa lançada errada, venda cancelada): lança o movimento contrário,
 * desfaz a taxa ligada e, se for baixa de título, devolve o saldo e recalcula o status.
 */
export async function estornarMovimento(tx: Tx, movimentoId: string, motivo: string, usuarioId: string | null): Promise<EfeitosFinanceiros> {
  const m = await tx.movimentoFinanceiro.findUnique({ where: { id: movimentoId }, include: { estornadoPor: true, taxas: { include: { estornadoPor: true } } } })
  if (!m) throw AppError.naoEncontrado('Movimento não encontrado.')
  if (m.estornoDeId) throw AppError.regraNegocio('Este lançamento já é um estorno.')
  if (m.estornadoPor) throw AppError.regraNegocio('Este lançamento já foi estornado.')
  const contrario = async (x: typeof m | (typeof m.taxas)[number]) =>
    tx.movimentoFinanceiro.create({
      data: {
        tipo: x.tipo === 'entrada' ? 'saida' : 'entrada',
        valor: x.valor,
        data: dataBanco(hojeISO()),
        descricao: `Estorno: ${x.descricao} (${motivo})`,
        contaFinanceiraId: x.contaFinanceiraId,
        categoriaId: x.categoriaId,
        formaPagamentoId: x.formaPagamentoId,
        contaReceberId: x.contaReceberId,
        contaPagarId: x.contaPagarId,
        caixaSessaoId: x.caixaSessaoId,
        vendaPdvId: x.vendaPdvId,
        estornoDeId: x.id,
        usuarioId,
      },
    })
  await contrario(m)
  for (const t of m.taxas) if (!t.estornadoPor) await contrario(t)

  const tipo: TipoTitulo | null = m.contaReceberId ? 'receber' : m.contaPagarId ? 'pagar' : null
  if (!tipo || !m.principal) return { pedidoId: null, comissaoLiberadaPara: [] }
  const tituloId = (m.contaReceberId ?? m.contaPagarId)!
  const t = (await delegate(tx, tipo).findUniqueOrThrow({ where: { id: tituloId } })) as unknown as {
    valor: Prisma.Decimal; valorPago: Prisma.Decimal; juros: Prisma.Decimal; multa: Prisma.Decimal; desconto: Prisma.Decimal; vencimento: Date; pedidoId?: string | null
  }
  const valorPago = Decimal.max(0, new Decimal(t.valorPago.toString()).minus(m.principal.toString()))
  const menos = (a: Prisma.Decimal, b: Prisma.Decimal) => Decimal.max(0, new Decimal(a.toString()).minus(b.toString())).toFixed(2)
  await delegate(tx, tipo).update({
    where: { id: tituloId },
    data: {
      valorPago: valorPago.toFixed(2),
      juros: menos(t.juros, m.juros),
      multa: menos(t.multa, m.multa),
      desconto: menos(t.desconto, m.desconto),
      status: statusTitulo(t.valor.toString(), valorPago, iso(t.vencimento), hojeISO()),
      pagoEm: null,
    },
  })
  const pedidoId = t.pedidoId ?? null
  if (pedidoId) await sincronizarFinanceiroPedido(tx, pedidoId)
  return { pedidoId, comissaoLiberadaPara: [] }
}
