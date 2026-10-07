import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import {
  podeMudarStatusPedido,
  hojeISO,
  type StatusPedido,
  type pedidoAtualizacaoSchema,
  type pedidosQuerySchema,
} from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { escopoProprio, type ContextoUsuario } from '../../core/escopo'
import { paginacao, paginado } from '../../core/paginacao'
import { atrasado, formatarResumo, incluirDetalhe, incluirResumo } from './consultas'

type Query = z.output<typeof pedidosQuerySchema>
const dataBanco = (iso: string) => new Date(`${iso}T00:00:00Z`)

/** Chamado na transação do cancelamento (Fase 5: estorno opcional do estoque consumido). Devolve quantos itens foram estornados. */
export type AoCancelarPedido = (tx: Prisma.TransactionClient, pedido: { id: string; numero: string; estornarEstoque: boolean }, usuarioId: string) => Promise<number>

export function criarPedidosService(app: FastifyInstance, aoCancelar: AoCancelarPedido = async () => 0) {
  const { prisma } = app

  async function obter(id: string, ctx: ContextoUsuario) {
    const p = await prisma.pedido.findFirst({ where: { id, ...escopoProprio(ctx, 'vendedorId') }, include: incluirDetalhe })
    if (!p) throw AppError.naoEncontrado('Pedido não encontrado.')
    return { ...p, atrasado: atrasado(p) }
  }

  function avisar(id: string, status?: StatusPedido) {
    app.tempoReal.emitir('pedidos', 'pedido:atualizado', { id, status })
    app.tempoReal.emitir('producao', 'op:atualizada', { pedidoId: id })
  }

  return {
    obter,

    async listar(q: Query, ctx: ContextoUsuario) {
      const hoje = dataBanco(hojeISO())
      const texto = q.busca ? { contains: q.busca, mode: 'insensitive' as const } : undefined
      const where: Prisma.PedidoWhereInput = {
        ...escopoProprio(ctx, 'vendedorId'),
        ...(q.status ? { status: q.status } : q.incluirFinalizados === 'true' ? {} : { status: { notIn: ['cancelado'] } }),
        ...(q.prioridade ? { prioridade: q.prioridade } : {}),
        ...(q.clienteId ? { clienteId: q.clienteId } : {}),
        ...(q.atrasados === 'true' ? { dataPrevistaEntrega: { lt: hoje }, status: { notIn: ['pronto', 'em_entrega', 'entregue', 'cancelado'] } } : {}),
        ...(texto ? { OR: [{ numero: texto }, { cliente: { nome: texto } }, { itens: { some: { descricao: texto } } }] } : {}),
        // Kanban: entregues só dos últimos 7 dias, para a coluna não crescer para sempre
        ...(q.kanban === 'true' ? { NOT: { status: 'entregue', updatedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } } : {}),
      }
      const pag = paginacao(q, ['createdAt', 'numero', 'dataPrevistaEntrega', 'total'] as const, { campo: 'dataPrevistaEntrega', direcao: 'asc' })
      const [total, data] = await prisma.$transaction([
        prisma.pedido.count({ where }),
        prisma.pedido.findMany({ where, ...pag, include: incluirResumo }),
      ])
      return paginado(data.map(formatarResumo), total, q)
    },

    async atualizar(id: string, dados: z.output<typeof pedidoAtualizacaoSchema>, ctx: ContextoUsuario) {
      const antes = await obter(id, ctx)
      if (['cancelado', 'entregue'].includes(antes.status)) throw AppError.regraNegocio('Pedido encerrado não pode ser alterado.')
      await prisma.$transaction(async (tx) => {
        const depois = await tx.pedido.update({
          where: { id },
          data: { ...dados, dataPrevistaEntrega: dataBanco(dados.dataPrevistaEntrega), enderecoEntrega: dados.enderecoEntrega ?? null },
        })
        // Nova previsão e prioridade valem para as OPs ainda não concluídas
        await tx.ordemProducao.updateMany({
          where: { pedidoId: id, etapaAtual: { not: 'concluido' }, cancelada: false },
          data: { dataFimPrevista: depois.dataPrevistaEntrega, prioridade: dados.prioridade },
        })
        await registrarAuditoria(tx, { tabela: 'pedidos', registroId: id, acao: 'editar', antes, depois, usuarioId: ctx.usuarioId })
      })
      avisar(id)
      return obter(id, ctx)
    },

    /** Mudança manual (kanban): livre entre colunas, exceto sair de entregue/cancelado ou cancelar arrastando. */
    async mudarStatus(id: string, status: StatusPedido, ctx: ContextoUsuario) {
      const antes = await obter(id, ctx)
      if (antes.status === status) return antes
      if (!podeMudarStatusPedido(antes.status, status)) {
        throw AppError.regraNegocio(status === 'cancelado' ? 'Para cancelar, use o botão Cancelar do pedido (pede o motivo).' : 'Pedido entregue ou cancelado não muda de status.')
      }
      await prisma.$transaction(async (tx) => {
        await tx.pedido.update({ where: { id }, data: { status } })
        await registrarAuditoria(tx, { tabela: 'pedidos', registroId: id, acao: 'editar', antes: { status: antes.status }, depois: { status }, usuarioId: ctx.usuarioId })
      })
      avisar(id, status)
      return obter(id, ctx)
    },

    /**
     * Cancelamento (seção 9): exige motivo, cancela os títulos em aberto, remove a comissão
     * prevista, cancela as OPs não concluídas e, se pedido, estorna o estoque consumido.
     */
    async cancelar(id: string, motivo: string, estornarEstoque: boolean, ctx: ContextoUsuario) {
      const antes = await obter(id, ctx)
      if (['cancelado', 'entregue'].includes(antes.status)) throw AppError.regraNegocio('Este pedido não pode ser cancelado.')
      await prisma.$transaction(async (tx) => {
        await tx.pedido.update({ where: { id }, data: { status: 'cancelado', motivoCancelamento: motivo, canceladoEm: new Date() } })
        const contas = await tx.contaReceber.updateMany({ where: { pedidoId: id, status: { in: ['aberto', 'vencido'] } }, data: { status: 'cancelado' } })
        const comissoes = await tx.comissao.deleteMany({ where: { pedidoId: id, status: 'prevista' } })
        const ops = await tx.ordemProducao.updateMany({ where: { pedidoId: id, etapaAtual: { not: 'concluido' } }, data: { cancelada: true } })
        await tx.entrega.updateMany({ where: { pedidoId: id, status: { in: ['pendente', 'agendada'] } }, data: { status: 'cancelada' } })
        const estornados = await aoCancelar(tx, { id, numero: antes.numero, estornarEstoque }, ctx.usuarioId)
        await registrarAuditoria(tx, {
          tabela: 'pedidos',
          registroId: id,
          acao: 'editar',
          antes: { status: antes.status },
          depois: { status: 'cancelado', motivo, contasCanceladas: contas.count, comissoesRemovidas: comissoes.count, opsCanceladas: ops.count, itensEstornados: estornados },
          usuarioId: ctx.usuarioId,
        })
      })
      avisar(id, 'cancelado')
      return obter(id, ctx)
    },
  }
}

export type PedidosService = ReturnType<typeof criarPedidosService>
