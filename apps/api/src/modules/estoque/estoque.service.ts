import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'
import { Decimal, type movimentacaoManualSchema, type movimentacoesQuerySchema, type posicaoEstoqueQuerySchema } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { paginacao, paginado } from '../../core/paginacao'
import { consolidar, formatarMovimentacao, formatarProdutoRef, incluirMovimentacao } from './consultas'
import { avisarAlertas, movimentar, type AlertaEstoque } from './movimentacao'

type QueryPosicao = z.output<typeof posicaoEstoqueQuerySchema>
type QueryMov = z.output<typeof movimentacoesQuerySchema>
type Manual = z.output<typeof movimentacaoManualSchema>

const inicioDoDia = (iso: string) => new Date(`${iso}T00:00:00-03:00`)
const fimDoDia = (iso: string) => new Date(`${iso}T23:59:59.999-03:00`)

/** Posição de estoque, extrato por produto, movimentações e lançamentos manuais. */
export function criarEstoqueService(app: FastifyInstance) {
  const { prisma } = app

  async function posicaoCompleta(q: Pick<QueryPosicao, 'localId' | 'categoriaId' | 'busca'>) {
    const texto = q.busca ? { contains: q.busca, mode: 'insensitive' as const } : undefined
    const produtos = await prisma.produto.findMany({
      where: {
        controlaEstoque: true,
        ativo: true,
        ...(q.categoriaId ? { categoriaId: q.categoriaId } : {}),
        ...(texto ? { OR: [{ nome: texto }, { codigo: texto }] } : {}),
      },
      orderBy: { nome: 'asc' },
      select: {
        id: true,
        codigo: true,
        nome: true,
        tipo: true,
        estoqueMinimo: true,
        unidadeMedida: { select: { sigla: true } },
        saldosEstoque: { where: q.localId ? { localId: q.localId } : {}, select: { quantidade: true, custoMedio: true, local: { select: { id: true, nome: true } } } },
        movimentacoesEstoque: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
    })
    return produtos.map((p) => ({
      produto: formatarProdutoRef(p),
      estoqueMinimo: p.estoqueMinimo.toFixed(3),
      ...consolidar(p.saldosEstoque, p.estoqueMinimo),
      locais: p.saldosEstoque.map((s) => ({ local: s.local, saldo: s.quantidade.toFixed(3) })),
      ultimaMovimentacao: p.movimentacoesEstoque[0]?.createdAt ?? null,
    }))
  }

  return {
    async posicao(q: QueryPosicao) {
      let linhas = await posicaoCompleta(q)
      if (q.situacao) linhas = linhas.filter((l) => l.situacao === q.situacao)
      if (q.alertas === 'true') linhas = linhas.filter((l) => l.situacao !== 'ok')
      const [campo, direcao] = (q.sort ?? 'nome:asc').split(':')
      const chave = (l: (typeof linhas)[number]) => (campo === 'saldo' ? Number(l.saldo) : campo === 'valor' ? Number(l.valorEstoque) : l.produto.nome)
      linhas.sort((a, b) => {
        const [x, y] = [chave(a), chave(b)]
        const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR')
        return direcao === 'desc' ? -r : r
      })
      const inicio = (q.page - 1) * q.pageSize
      return paginado(linhas.slice(inicio, inicio + q.pageSize), linhas.length, q)
    },

    /** Produtos abaixo do mínimo (badge do menu). */
    async contagemAlertas() {
      return { total: (await posicaoCompleta({})).filter((l) => l.situacao !== 'ok').length }
    },

    async doProduto(produtoId: string) {
      const p = await prisma.produto.findUnique({
        where: { id: produtoId },
        select: {
          id: true,
          codigo: true,
          nome: true,
          tipo: true,
          controlaEstoque: true,
          estoqueMinimo: true,
          unidadeMedida: { select: { sigla: true } },
          saldosEstoque: { select: { quantidade: true, custoMedio: true, local: { select: { id: true, nome: true } } } },
        },
      })
      if (!p) throw AppError.naoEncontrado('Produto não encontrado.')
      const movimentacoes = await prisma.estoqueMovimentacao.findMany({ where: { produtoId }, orderBy: { createdAt: 'desc' }, take: 50, include: incluirMovimentacao })
      const { saldosEstoque, estoqueMinimo, controlaEstoque, ...ref } = p
      const c = consolidar(saldosEstoque, estoqueMinimo)
      return {
        produto: { ...formatarProdutoRef(ref), controlaEstoque, estoqueMinimo: estoqueMinimo.toFixed(3) },
        saldo: c.saldo,
        custoMedio: c.custoMedio,
        situacao: c.situacao,
        locais: saldosEstoque.map((s) => ({ local: s.local, saldo: s.quantidade.toFixed(3), custoMedio: s.custoMedio.toFixed(4) })),
        movimentacoes: movimentacoes.map(formatarMovimentacao),
      }
    },

    async movimentacoes(q: QueryMov) {
      const texto = q.busca ? { contains: q.busca, mode: 'insensitive' as const } : undefined
      const where: Prisma.EstoqueMovimentacaoWhereInput = {
        ...(q.tipo ? { tipo: q.tipo } : {}),
        ...(q.produtoId ? { produtoId: q.produtoId } : {}),
        ...(q.localId ? { localId: q.localId } : {}),
        ...(q.opId ? { opId: q.opId } : {}),
        ...(q.pedidoId ? { pedidoId: q.pedidoId } : {}),
        ...(q.de || q.ate ? { createdAt: { ...(q.de ? { gte: inicioDoDia(q.de) } : {}), ...(q.ate ? { lte: fimDoDia(q.ate) } : {}) } } : {}),
        ...(texto ? { OR: [{ produto: { nome: texto } }, { motivo: texto }, { op: { numero: texto } }, { pedido: { numero: texto } }] } : {}),
      }
      const pag = paginacao(q, ['createdAt', 'quantidade'] as const, { campo: 'createdAt', direcao: 'desc' })
      const [total, data] = await prisma.$transaction([
        prisma.estoqueMovimentacao.count({ where }),
        prisma.estoqueMovimentacao.findMany({ where, ...pag, include: incluirMovimentacao }),
      ])
      return paginado(data.map(formatarMovimentacao), total, q)
    },

    /** Saída, perda, ajuste de inventário (pelo saldo contado) ou transferência entre locais. */
    async lancarManual(d: Manual, usuarioId: string) {
      const alertas: (AlertaEstoque | null)[] = []
      const ids = await prisma.$transaction(async (tx) => {
        if (d.tipo === 'saida' || d.tipo === 'perda') {
          const r = await movimentar(tx, { tipo: d.tipo, produtoId: d.produtoId, localId: d.localId, quantidade: new Decimal(d.quantidade).neg(), motivo: d.motivo, usuarioId })
          alertas.push(r.alerta)
          return [r.id]
        }
        if (d.tipo === 'ajuste') {
          const atual = await tx.estoqueSaldo.findUnique({ where: { produtoId_localId: { produtoId: d.produtoId, localId: d.localId } } })
          const diferenca = new Decimal(d.saldoContado).minus(atual?.quantidade.toString() ?? 0)
          if (diferenca.isZero()) throw AppError.regraNegocio('O saldo contado é igual ao saldo atual: nada a ajustar.')
          const r = await movimentar(tx, { tipo: 'ajuste', produtoId: d.produtoId, localId: d.localId, quantidade: diferenca, motivo: d.motivo, usuarioId, permitirNegativo: false })
          alertas.push(r.alerta)
          return [r.id]
        }
        if (d.localDestinoId === d.localId) throw AppError.regraNegocio('Escolha um local de destino diferente da origem.')
        const origem = await tx.estoqueSaldo.findUnique({ where: { produtoId_localId: { produtoId: d.produtoId, localId: d.localId } } })
        const transferenciaId = randomUUID()
        const base = { tipo: 'transferencia' as const, produtoId: d.produtoId, motivo: d.motivo, transferenciaId, usuarioId, verificarAlerta: false }
        const saida = await movimentar(tx, { ...base, localId: d.localId, quantidade: new Decimal(d.quantidade).neg() })
        // O custo médio da origem acompanha o material até o destino
        const chegada = await movimentar(tx, { ...base, localId: d.localDestinoId, quantidade: new Decimal(d.quantidade), custoEntrada: origem?.custoMedio.toFixed(4) ?? '0' })
        return [saida.id, chegada.id]
      })
      avisarAlertas(app, alertas)
      const criadas = await prisma.estoqueMovimentacao.findMany({ where: { id: { in: ids } }, include: incluirMovimentacao, orderBy: { createdAt: 'asc' } })
      return criadas.map(formatarMovimentacao)
    },
  }
}

export type EstoqueService = ReturnType<typeof criarEstoqueService>
