import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'
import { Decimal, type cadastroQuerySchema, type categoriaFinanceiraSchema, type contaFinanceiraSchema, type formaPagamentoSchema } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { criarCrud } from '../../core/crud'

type QueryCadastro = z.output<typeof cadastroQuerySchema>

/** Formas de pagamento, contas financeiras (com saldo) e categorias (receita/despesa, com pai). */
export function criarCadastrosFinanceiros(app: FastifyInstance) {
  const { prisma } = app

  const formas = criarCrud<z.output<typeof formaPagamentoSchema>, QueryCadastro>(app, {
    tabela: 'formas_pagamento',
    rotulo: 'Forma de pagamento',
    delegate: (db) => db.formaPagamento,
    include: { contaFinanceira: { select: { id: true, nome: true } } },
    busca: ['nome'],
    ordenaveis: ['nome', 'createdAt'],
    padrao: { campo: 'nome', direcao: 'asc' },
    conflitos: { nome: 'Já existe uma forma com este nome.' },
    validar: async (d) => {
      if (d.maxParcelas > 1 && !d.permiteParcelamento) throw AppError.regraNegocio('Marque "Permite parcelamento" para aceitar mais de uma parcela.')
    },
  })

  const categorias = criarCrud<z.output<typeof categoriaFinanceiraSchema>, QueryCadastro>(app, {
    tabela: 'categorias_financeiras',
    rotulo: 'Categoria',
    delegate: (db) => db.categoriaFinanceira,
    include: { pai: { select: { id: true, nome: true } } },
    busca: ['nome'],
    ordenaveis: ['nome', 'tipo', 'createdAt'],
    padrao: { campo: 'nome', direcao: 'asc' },
    validar: async (d, id) => {
      if (!d.paiId) return
      if (d.paiId === id) throw AppError.regraNegocio('A categoria não pode ser pai dela mesma.')
      const pai = await prisma.categoriaFinanceira.findUnique({ where: { id: d.paiId } })
      if (!pai || pai.tipo !== d.tipo) throw AppError.regraNegocio('A categoria pai precisa ser do mesmo tipo (receita ou despesa).')
      if (pai.paiId) throw AppError.regraNegocio('Use no máximo dois níveis (categoria e subcategoria).')
    },
  })

  const contasCrud = criarCrud<z.output<typeof contaFinanceiraSchema>, QueryCadastro>(app, {
    tabela: 'contas_financeiras',
    rotulo: 'Conta',
    delegate: (db) => db.contaFinanceira,
    busca: ['nome', 'banco'],
    ordenaveis: ['nome', 'createdAt'],
    padrao: { campo: 'nome', direcao: 'asc' },
    conflitos: { nome: 'Já existe uma conta com este nome.' },
  })

  /** Saldo = saldo inicial + entradas − saídas realizadas. */
  async function saldos() {
    const grupos = await prisma.movimentoFinanceiro.groupBy({ by: ['contaFinanceiraId', 'tipo'], _sum: { valor: true } })
    const mapa = new Map<string, Decimal>()
    for (const g of grupos) {
      const v = new Decimal(g._sum.valor?.toString() ?? 0)
      mapa.set(g.contaFinanceiraId, (mapa.get(g.contaFinanceiraId) ?? new Decimal(0)).plus(g.tipo === 'entrada' ? v : v.neg()))
    }
    return mapa
  }

  const contas = {
    ...contasCrud,
    async listar(q: QueryCadastro) {
      const [r, mapa] = await Promise.all([contasCrud.listar(q), saldos()])
      return {
        ...r,
        data: (r.data as { id: string; saldoInicial: { toString(): string } }[]).map((c) => ({
          ...c,
          saldoAtual: new Decimal(c.saldoInicial.toString()).plus(mapa.get(c.id) ?? 0).toFixed(2),
        })),
      }
    },
  }

  return { formas, categorias, contas }
}
