import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'
import { Decimal, hojeISO, type abrirCaixaSchema, type fecharCaixaSchema, type sangriaSuprimentoSchema, type sessoesQuerySchema } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { proximoNumero } from '../../core/numeracao'
import { paginacao, paginado } from '../../core/paginacao'
import { categoriaPorCodigo } from '../financeiro/baixa'

type Tx = Prisma.TransactionClient
const ref = { select: { id: true, nome: true } } as const
const incluirSessao = { usuario: ref, fechadaPor: ref, contaFinanceira: ref } satisfies Prisma.CaixaSessaoInclude
const dataBanco = (iso: string) => new Date(`${iso}T00:00:00Z`)

/** Sessões de caixa: abertura, sangria/suprimento, resumo por forma e fechamento com conferência. */
export function criarSessaoService(app: FastifyInstance) {
  const { prisma } = app

  /** Resumo por forma: abertura, sangria e suprimento contam como dinheiro. */
  async function resumo(sessaoId: string, db: Tx | typeof prisma = prisma) {
    const [movs, formas] = await Promise.all([
      db.caixaMovimento.groupBy({ by: ['formaPagamentoId'], where: { sessaoId }, _sum: { valor: true } }),
      db.formaPagamento.findMany({ select: { id: true, nome: true, tipo: true } }),
    ])
    const dinheiro = formas.find((f) => f.tipo === 'dinheiro')
    const mapa = new Map<string | null, Decimal>()
    for (const m of movs) {
      const forma = formas.find((f) => f.id === m.formaPagamentoId)
      const chave = !m.formaPagamentoId || forma?.tipo === 'dinheiro' ? (dinheiro?.id ?? null) : m.formaPagamentoId
      mapa.set(chave, (mapa.get(chave) ?? new Decimal(0)).plus(m._sum.valor?.toString() ?? 0))
    }
    if (!mapa.has(dinheiro?.id ?? null)) mapa.set(dinheiro?.id ?? null, new Decimal(0))
    const porForma = [...mapa.entries()].map(([id, v]) => {
      const f = formas.find((x) => x.id === id)
      return { formaPagamentoId: id, nome: f?.nome ?? 'Dinheiro', tipo: f?.tipo ?? 'dinheiro', calculado: v.toFixed(2) }
    })
    porForma.sort((a, b) => (a.tipo === 'dinheiro' ? -1 : b.tipo === 'dinheiro' ? 1 : a.nome.localeCompare(b.nome)))
    return { porForma, dinheiroEsperado: porForma.find((p) => p.tipo === 'dinheiro')?.calculado ?? '0.00' }
  }

  async function detalhe(id: string) {
    const s = await prisma.caixaSessao.findUnique({
      where: { id },
      include: {
        ...incluirSessao,
        movimentos: {
          orderBy: { createdAt: 'desc' },
          include: { formaPagamento: ref, usuario: ref, vendaPdv: { select: { id: true, numero: true } }, contaReceber: { select: { id: true, descricao: true } } },
        },
      },
    })
    if (!s) throw AppError.naoEncontrado('Sessão de caixa não encontrada.')
    const vendas = await prisma.vendaPdv.aggregate({ where: { sessaoId: id, status: 'concluida' }, _count: true, _sum: { total: true } })
    return { ...s, ...(await resumo(id)), vendas: { quantidade: vendas._count, total: vendas._sum.total?.toFixed(2) ?? '0.00' } }
  }

  async function aberta(usuarioId: string) {
    return prisma.caixaSessao.findFirst({ where: { usuarioId, status: 'aberta' } })
  }

  async function exigirAberta(usuarioId: string) {
    const s = await aberta(usuarioId)
    if (!s) throw AppError.regraNegocio('Abra o caixa antes de vender ou receber.')
    return s
  }

  /** Conta que recebe a sangria ou fornece o suprimento: a escolhida ou a primeira conta bancária. */
  async function contaContraparte(tx: Tx, sessaoConta: string, escolhida?: string | null) {
    const conta = escolhida
      ? await tx.contaFinanceira.findUnique({ where: { id: escolhida } })
      : await tx.contaFinanceira.findFirst({ where: { ativo: true, id: { not: sessaoConta } }, orderBy: [{ tipo: 'asc' }, { nome: 'asc' }] })
    if (!conta?.ativo || conta.id === sessaoConta) throw AppError.regraNegocio('Escolha outra conta para a sangria ou o suprimento.')
    return conta.id
  }

  return {
    detalhe,
    aberta,
    exigirAberta,
    resumo,

    async atual(usuarioId: string) {
      const s = await aberta(usuarioId)
      return s ? detalhe(s.id) : null
    },

    async abrir(d: z.output<typeof abrirCaixaSchema>, usuarioId: string) {
      if (await aberta(usuarioId)) throw AppError.regraNegocio('Você já tem um caixa aberto.')
      const conta = d.contaFinanceiraId
        ? await prisma.contaFinanceira.findUnique({ where: { id: d.contaFinanceiraId } })
        : await prisma.contaFinanceira.findFirst({ where: { tipo: 'caixa', ativo: true }, orderBy: { createdAt: 'asc' } })
      if (!conta?.ativo) throw AppError.regraNegocio('Cadastre uma conta do tipo caixa em Financeiro → Formas de pagamento.')
      const id = await prisma.$transaction(async (tx) => {
        const s = await tx.caixaSessao.create({
          data: { numero: await proximoNumero(tx, 'caixa'), usuarioId, contaFinanceiraId: conta.id, valorAbertura: d.valorAbertura },
        })
        await tx.caixaMovimento.create({ data: { sessaoId: s.id, tipo: 'abertura', valor: d.valorAbertura, motivo: 'Troco inicial', usuarioId } })
        await registrarAuditoria(tx, { tabela: 'caixa_sessoes', registroId: s.id, acao: 'abrir', depois: { valorAbertura: d.valorAbertura }, usuarioId })
        return s.id
      })
      return detalhe(id)
    },

    /** Sangria (tira dinheiro da gaveta) e suprimento (coloca), com motivo, como transferência entre contas. */
    async sangriaSuprimento(d: z.output<typeof sangriaSuprimentoSchema>, usuarioId: string) {
      const s = await exigirAberta(usuarioId)
      await prisma.$transaction(async (tx) => {
        if (d.tipo === 'sangria') {
          const { dinheiroEsperado } = await resumo(s.id, tx)
          if (new Decimal(d.valor).gt(dinheiroEsperado)) throw AppError.regraNegocio(`Só há R$ ${dinheiroEsperado.replace('.', ',')} em dinheiro no caixa.`)
        }
        const outra = await contaContraparte(tx, s.contaFinanceiraId, d.contaFinanceiraId)
        const transferenciaId = randomUUID()
        const [origem, destino] = d.tipo === 'sangria' ? [s.contaFinanceiraId, outra] : [outra, s.contaFinanceiraId]
        const base = { valor: d.valor, data: dataBanco(hojeISO()), descricao: `${d.tipo === 'sangria' ? 'Sangria' : 'Suprimento'} ${s.numero}: ${d.motivo}`, transferenciaId, caixaSessaoId: s.id, usuarioId }
        await tx.movimentoFinanceiro.create({ data: { ...base, tipo: 'saida', contaFinanceiraId: origem } })
        const mov = await tx.movimentoFinanceiro.create({ data: { ...base, tipo: 'entrada', contaFinanceiraId: destino } })
        await tx.caixaMovimento.create({
          data: { sessaoId: s.id, tipo: d.tipo, valor: d.tipo === 'sangria' ? new Decimal(d.valor).neg().toFixed(2) : d.valor, motivo: d.motivo, movimentoFinanceiroId: mov.id, usuarioId },
        })
      })
      return detalhe(s.id)
    },

    /**
     * Fechamento com conferência por forma (seção 9): informado × calculado. A diferença em dinheiro
     * vira lançamento na conta do caixa (sobra = outras receitas, falta = outras despesas).
     */
    async fechar(sessaoId: string, d: z.output<typeof fecharCaixaSchema>, usuarioId: string, podeOutros: boolean) {
      const s = await prisma.caixaSessao.findUnique({ where: { id: sessaoId } })
      if (!s || s.status !== 'aberta') throw AppError.regraNegocio('Este caixa não está aberto.')
      if (s.usuarioId !== usuarioId && !podeOutros) throw AppError.semPermissao('Só quem abriu (ou um gerente) pode fechar este caixa.')
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM caixa_sessoes WHERE id = ${sessaoId}::uuid FOR UPDATE`
        const { porForma } = await resumo(sessaoId, tx)
        const informado = new Map(d.informados.map((i) => [i.formaPagamentoId, new Decimal(i.valor)]))
        const conferencia = porForma.map((p) => {
          const inf = informado.get(p.formaPagamentoId ?? '') ?? new Decimal(p.calculado)
          return { ...p, informado: inf.toFixed(2), diferenca: inf.minus(p.calculado).toFixed(2) }
        })
        const totalCalculado = conferencia.reduce((t, c) => t.plus(c.calculado), new Decimal(0))
        const totalInformado = conferencia.reduce((t, c) => t.plus(c.informado), new Decimal(0))
        const difDinheiro = new Decimal(conferencia.find((c) => c.tipo === 'dinheiro')?.diferenca ?? 0)
        if (!difDinheiro.isZero()) {
          await tx.movimentoFinanceiro.create({
            data: {
              tipo: difDinheiro.gt(0) ? 'entrada' : 'saida',
              valor: difDinheiro.abs().toFixed(2),
              data: dataBanco(hojeISO()),
              descricao: `Diferença de caixa ${s.numero} (${difDinheiro.gt(0) ? 'sobra' : 'falta'})`,
              contaFinanceiraId: s.contaFinanceiraId,
              categoriaId: await categoriaPorCodigo(tx, difDinheiro.gt(0) ? 'outras_receitas' : 'outras_despesas'),
              caixaSessaoId: s.id,
              usuarioId,
            },
          })
        }
        await tx.caixaSessao.update({
          where: { id: sessaoId },
          data: {
            status: 'fechada',
            fechadaEm: new Date(),
            fechadaPorId: usuarioId,
            totalCalculado: totalCalculado.toFixed(2),
            totalInformado: totalInformado.toFixed(2),
            diferenca: totalInformado.minus(totalCalculado).toFixed(2),
            conferencia,
            observacao: d.observacao ?? null,
          },
        })
        await registrarAuditoria(tx, { tabela: 'caixa_sessoes', registroId: sessaoId, acao: 'fechar', depois: { totalCalculado: totalCalculado.toFixed(2), totalInformado: totalInformado.toFixed(2) }, usuarioId })
      })
      return detalhe(sessaoId)
    },

    async listar(q: z.output<typeof sessoesQuerySchema>, usuarioId: string, veTodos: boolean) {
      const where: Prisma.CaixaSessaoWhereInput = {
        ...(veTodos ? (q.usuarioId ? { usuarioId: q.usuarioId } : {}) : { usuarioId }),
        ...(q.de || q.ate ? { abertaEm: { ...(q.de ? { gte: new Date(`${q.de}T00:00:00-03:00`) } : {}), ...(q.ate ? { lte: new Date(`${q.ate}T23:59:59.999-03:00`) } : {}) } } : {}),
      }
      const pag = paginacao(q, ['abertaEm', 'numero'] as const, { campo: 'abertaEm', direcao: 'desc' })
      const [total, data] = await prisma.$transaction([prisma.caixaSessao.count({ where }), prisma.caixaSessao.findMany({ where, ...pag, include: incluirSessao })])
      return paginado(data, total, q)
    },
  }
}

export type SessaoService = ReturnType<typeof criarSessaoService>
