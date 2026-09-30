import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'
import { Decimal, adicionarDias, hojeISO, type fluxoQuerySchema, type movimentosQuerySchema } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { paginacao, paginado } from '../../core/paginacao'
import { formatarMovimento, incluirMovimento } from './titulos-consultas'

const dataBanco = (iso: string) => new Date(`${iso}T00:00:00Z`)
const iso = (d: Date) => d.toISOString().slice(0, 10)
const ZERO = () => new Decimal(0)
const ABERTOS = ['aberto', 'parcial', 'vencido'] as ('aberto' | 'parcial' | 'vencido')[]

/** Fluxo de caixa (realizado + previsto), calendário financeiro e extrato de movimentos. */
export function criarFluxoService(app: FastifyInstance) {
  const { prisma } = app

  async function saldoAte(ateExclusivo: string, contaId?: string) {
    const contas = await prisma.contaFinanceira.aggregate({ where: contaId ? { id: contaId } : {}, _sum: { saldoInicial: true } })
    const movs = await prisma.movimentoFinanceiro.groupBy({
      by: ['tipo'],
      where: { data: { lt: dataBanco(ateExclusivo) }, ...(contaId ? { contaFinanceiraId: contaId } : {}) },
      _sum: { valor: true },
    })
    let saldo = new Decimal(contas._sum.saldoInicial?.toString() ?? 0)
    for (const m of movs) saldo = m.tipo === 'entrada' ? saldo.plus(m._sum.valor?.toString() ?? 0) : saldo.minus(m._sum.valor?.toString() ?? 0)
    return saldo
  }

  /** Títulos em aberto por dia de vencimento (vencidos antes de hoje entram no dia de hoje). */
  async function previstos(de: string, ate: string) {
    const hoje = hojeISO()
    const filtro = { status: { in: ABERTOS }, vencimento: { lte: dataBanco(ate), ...(de > hoje ? { gte: dataBanco(de) } : {}) } }
    const [receber, pagar] = await Promise.all([
      prisma.contaReceber.findMany({ where: filtro, select: { valor: true, valorPago: true, vencimento: true } }),
      prisma.contaPagar.findMany({ where: filtro, select: { valor: true, valorPago: true, vencimento: true } }),
    ])
    const dia = (d: Date) => (iso(d) < hoje ? hoje : iso(d))
    const somar = (lista: typeof receber) => {
      const m = new Map<string, Decimal>()
      for (const t of lista) m.set(dia(t.vencimento), (m.get(dia(t.vencimento)) ?? ZERO()).plus(t.valor.toString()).minus(t.valorPago.toString()))
      return m
    }
    return { receber: somar(receber), pagar: somar(pagar) }
  }

  return {
    async fluxo(q: z.output<typeof fluxoQuerySchema>) {
      if (q.ate < q.de) throw AppError.regraNegocio('A data final deve ser depois da inicial.')
      const dias: string[] = []
      for (let d = q.de; d <= q.ate && dias.length < 400; d = adicionarDias(d, 1)) dias.push(d)
      const conta = q.contaFinanceiraId ? { contaFinanceiraId: q.contaFinanceiraId } : {}
      const [saldoInicial, movs, prev] = await Promise.all([
        saldoAte(q.de, q.contaFinanceiraId),
        prisma.movimentoFinanceiro.findMany({
          where: { data: { gte: dataBanco(q.de), lte: dataBanco(q.ate) }, ...conta },
          select: { tipo: true, valor: true, data: true, transferenciaId: true, categoria: { select: { nome: true } } },
        }),
        q.contaFinanceiraId ? Promise.resolve({ receber: new Map<string, Decimal>(), pagar: new Map<string, Decimal>() }) : previstos(q.de, q.ate),
      ])
      const porDia = new Map<string, { e: Decimal; s: Decimal }>()
      const porCategoria = new Map<string, { tipo: 'entrada' | 'saida'; valor: Decimal }>()
      for (const m of movs) {
        const d = iso(m.data)
        const atual = porDia.get(d) ?? { e: ZERO(), s: ZERO() }
        if (m.tipo === 'entrada') atual.e = atual.e.plus(m.valor.toString())
        else atual.s = atual.s.plus(m.valor.toString())
        porDia.set(d, atual)
        // Transferências entre contas (sangria/suprimento) não são receita nem despesa
        if (m.transferenciaId) continue
        const chave = `${m.tipo}:${m.categoria?.nome ?? 'Sem categoria'}`
        const c = porCategoria.get(chave) ?? { tipo: m.tipo, valor: ZERO() }
        c.valor = c.valor.plus(m.valor.toString())
        porCategoria.set(chave, c)
      }
      let saldo = saldoInicial
      let projetado = saldoInicial
      const tot = { e: ZERO(), s: ZERO(), pe: ZERO(), ps: ZERO() }
      const linhas = dias.map((data) => {
        const r = porDia.get(data) ?? { e: ZERO(), s: ZERO() }
        const pe = prev.receber.get(data) ?? ZERO()
        const ps = prev.pagar.get(data) ?? ZERO()
        saldo = saldo.plus(r.e).minus(r.s)
        projetado = projetado.plus(r.e).minus(r.s).plus(pe).minus(ps)
        tot.e = tot.e.plus(r.e)
        tot.s = tot.s.plus(r.s)
        tot.pe = tot.pe.plus(pe)
        tot.ps = tot.ps.plus(ps)
        return { data, entradas: r.e.toFixed(2), saidas: r.s.toFixed(2), previstoEntradas: pe.toFixed(2), previstoSaidas: ps.toFixed(2), saldo: saldo.toFixed(2), saldoProjetado: projetado.toFixed(2) }
      })
      return {
        de: q.de,
        ate: q.ate,
        saldoInicial: saldoInicial.toFixed(2),
        dias: linhas,
        totais: { entradas: tot.e.toFixed(2), saidas: tot.s.toFixed(2), previstoEntradas: tot.pe.toFixed(2), previstoSaidas: tot.ps.toFixed(2), saldoFinal: saldo.toFixed(2), saldoProjetado: projetado.toFixed(2) },
        porCategoria: [...porCategoria.entries()]
          .map(([chave, c]) => ({ categoria: chave.split(':').slice(1).join(':'), tipo: c.tipo, valor: c.valor.toFixed(2) }))
          .sort((a, b) => Number(b.valor) - Number(a.valor)),
      }
    },

    /** Mês em grade: a receber/a pagar (títulos em aberto por vencimento) e recebido/pago (movimentos). */
    async calendario(mes: string) {
      const [ano, numeroMes] = mes.split('-').map(Number) as [number, number]
      const de = `${mes}-01`
      // Dia 0 do mês seguinte = último dia deste mês
      const fim = `${mes}-${String(new Date(Date.UTC(ano, numeroMes, 0)).getUTCDate()).padStart(2, '0')}`
      const filtro = { vencimento: { gte: dataBanco(de), lte: dataBanco(fim) }, status: { not: 'cancelado' as const } }
      const [receber, pagar, movs] = await Promise.all([
        prisma.contaReceber.findMany({ where: filtro, select: { id: true, descricao: true, valor: true, valorPago: true, vencimento: true, status: true, cliente: { select: { nome: true } } } }),
        prisma.contaPagar.findMany({ where: filtro, select: { id: true, descricao: true, valor: true, valorPago: true, vencimento: true, status: true, fornecedor: { select: { nome: true } } } }),
        prisma.movimentoFinanceiro.findMany({ where: { data: { gte: dataBanco(de), lte: dataBanco(fim) }, transferenciaId: null, OR: [{ contaReceberId: { not: null } }, { contaPagarId: { not: null } }] }, select: { tipo: true, valor: true, data: true } }),
      ])
      const dias = new Map<string, { aReceber: Decimal; aPagar: Decimal; recebido: Decimal; pago: Decimal; titulos: unknown[] }>()
      const dia = (d: string) => {
        if (!dias.has(d)) dias.set(d, { aReceber: ZERO(), aPagar: ZERO(), recebido: ZERO(), pago: ZERO(), titulos: [] })
        return dias.get(d)!
      }
      for (const t of receber) {
        const saldo = new Decimal(t.valor.toString()).minus(t.valorPago.toString())
        const d = dia(iso(t.vencimento))
        if (saldo.gt(0)) d.aReceber = d.aReceber.plus(saldo)
        d.titulos.push({ id: t.id, tipo: 'receber', descricao: t.descricao, saldo: saldo.toFixed(2), status: t.status, pessoa: t.cliente.nome })
      }
      for (const t of pagar) {
        const saldo = new Decimal(t.valor.toString()).minus(t.valorPago.toString())
        const d = dia(iso(t.vencimento))
        if (saldo.gt(0)) d.aPagar = d.aPagar.plus(saldo)
        d.titulos.push({ id: t.id, tipo: 'pagar', descricao: t.descricao, saldo: saldo.toFixed(2), status: t.status, pessoa: t.fornecedor?.nome ?? null })
      }
      for (const m of movs) {
        const d = dia(iso(m.data))
        if (m.tipo === 'entrada') d.recebido = d.recebido.plus(m.valor.toString())
        else d.pago = d.pago.plus(m.valor.toString())
      }
      return [...dias.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([data, d]) => ({ data, aReceber: d.aReceber.toFixed(2), aPagar: d.aPagar.toFixed(2), recebido: d.recebido.toFixed(2), pago: d.pago.toFixed(2), titulos: d.titulos }))
    },

    async movimentos(q: z.output<typeof movimentosQuerySchema>) {
      const where: Prisma.MovimentoFinanceiroWhereInput = {
        ...(q.de || q.ate ? { data: { ...(q.de ? { gte: dataBanco(q.de) } : {}), ...(q.ate ? { lte: dataBanco(q.ate) } : {}) } } : {}),
        ...(q.contaFinanceiraId ? { contaFinanceiraId: q.contaFinanceiraId } : {}),
        ...(q.tipo ? { tipo: q.tipo } : {}),
        ...(q.categoriaId ? { categoriaId: q.categoriaId } : {}),
        ...(q.busca ? { descricao: { contains: q.busca, mode: 'insensitive' } } : {}),
      }
      const pag = paginacao(q, ['data', 'valor', 'createdAt'] as const, { campo: 'data', direcao: 'desc' })
      const [total, data] = await prisma.$transaction([prisma.movimentoFinanceiro.count({ where }), prisma.movimentoFinanceiro.findMany({ where, ...pag, include: incluirMovimento })])
      return paginado(data.map(formatarMovimento), total, q)
    },
  }
}
