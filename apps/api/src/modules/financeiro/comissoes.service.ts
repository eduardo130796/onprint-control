import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'
import { Decimal, type comissoesQuerySchema, type pagarComissoesSchema } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { paginacao, paginado } from '../../core/paginacao'
import { categoriaPorCodigo } from './baixa'

const incluir = {
  vendedor: { select: { id: true, nome: true } },
  pedido: { select: { id: true, numero: true, status: true, statusFinanceiro: true, cliente: { select: { id: true, nome: true } } } },
} satisfies Prisma.ComissaoInclude

/** Comissões: prevista (pedido convertido) → liberada (pedido pago) → paga (lançada no financeiro). */
export function criarComissoesService(app: FastifyInstance) {
  const { prisma } = app
  return {
    async listar(q: z.output<typeof comissoesQuerySchema>) {
      const texto = q.busca ? { contains: q.busca, mode: 'insensitive' as const } : undefined
      const where: Prisma.ComissaoWhereInput = {
        ...(q.status ? { status: q.status } : {}),
        ...(q.vendedorId ? { vendedorId: q.vendedorId } : {}),
        ...(texto ? { OR: [{ pedido: { numero: texto } }, { vendedor: { nome: texto } }, { pedido: { cliente: { nome: texto } } }] } : {}),
      }
      const pag = paginacao(q, ['createdAt', 'valor', 'liberadaEm'] as const, { campo: 'createdAt', direcao: 'desc' })
      const [total, data, porStatus] = await Promise.all([
        prisma.comissao.count({ where }),
        prisma.comissao.findMany({ where, ...pag, include: incluir }),
        prisma.comissao.groupBy({ by: ['status'], where: q.vendedorId ? { vendedorId: q.vendedorId } : {}, _sum: { valor: true } }),
      ])
      const resumo = Object.fromEntries(porStatus.map((g) => [g.status, g._sum.valor?.toFixed(2) ?? '0.00']))
      return { ...paginado(data, total, q), resumo }
    },

    /** Paga comissões liberadas: uma saída por comissão na conta escolhida (categoria Comissões). */
    async pagar(d: z.output<typeof pagarComissoesSchema>, usuarioId: string) {
      const comissoes = await prisma.comissao.findMany({ where: { id: { in: d.ids } }, include: incluir })
      if (comissoes.length !== d.ids.length) throw AppError.naoEncontrado('Comissão não encontrada.')
      const naoLiberadas = comissoes.filter((c) => c.status !== 'liberada')
      if (naoLiberadas.length) throw AppError.regraNegocio(`Só comissões liberadas podem ser pagas (${naoLiberadas.map((c) => c.pedido.numero).join(', ')}).`)
      await prisma.$transaction(async (tx) => {
        const categoriaId = await categoriaPorCodigo(tx, 'comissoes')
        for (const c of comissoes) {
          await tx.movimentoFinanceiro.create({
            data: {
              tipo: 'saida',
              valor: c.valor,
              data: new Date(`${d.data}T00:00:00Z`),
              descricao: `Comissão ${c.vendedor.nome} · ${c.pedido.numero}`,
              contaFinanceiraId: d.contaFinanceiraId,
              formaPagamentoId: d.formaPagamentoId ?? null,
              categoriaId,
              comissaoId: c.id,
              usuarioId,
            },
          })
          await tx.comissao.update({ where: { id: c.id }, data: { status: 'paga', pagaEm: new Date() } })
          await tx.notificacao.create({ data: { usuarioId: c.vendedorId, titulo: `Comissão paga: ${c.pedido.numero}`, mensagem: `R$ ${new Decimal(c.valor.toString()).toFixed(2).replace('.', ',')}`, link: null } })
        }
        await registrarAuditoria(tx, { tabela: 'comissoes', registroId: null, acao: 'baixa', depois: { ids: d.ids, conta: d.contaFinanceiraId, data: d.data }, usuarioId })
      })
      for (const c of comissoes) app.tempoReal.emitir(`usuario:${c.vendedorId}`, 'notificacao:nova', { titulo: `Comissão paga: ${c.pedido.numero}` })
      return { pagas: comissoes.length }
    },
  }
}
