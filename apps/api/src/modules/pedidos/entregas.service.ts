import type { Prisma } from '@prisma/client'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { EXTENSOES_PERMITIDAS, type entregaSchema, type entregasQuerySchema, type realizarEntregaSchema } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { escopoProprio, type ContextoUsuario } from '../../core/escopo'
import { paginacao, paginado } from '../../core/paginacao'
import type { ArquivosService } from '../arquivos/service'

const incluir = {
  responsavel: { select: { id: true, nome: true } },
  pedido: { select: { id: true, numero: true, status: true, vendedorId: true, cliente: { select: { id: true, nome: true } } } },
} satisfies Prisma.EntregaInclude

/**
 * Entregas, retiradas e instalações. Realizar a entrega marca o pedido como "entregue";
 * "saiu para entrega" coloca o pedido pronto em "em entrega".
 */
export function criarEntregasService(app: FastifyInstance, arquivos: ArquivosService) {
  const { prisma } = app

  async function obter(id: string, ctx: ContextoUsuario) {
    const e = await prisma.entrega.findFirst({ where: { id, pedido: escopoProprio(ctx, 'vendedorId') }, include: incluir })
    if (!e) throw AppError.naoEncontrado('Entrega não encontrada.')
    return e
  }

  function avisar(pedidoId: string) {
    app.tempoReal.emitir('pedidos', 'pedido:atualizado', { id: pedidoId })
  }

  async function alterar(id: string, ctx: ContextoUsuario, data: Prisma.EntregaUncheckedUpdateInput, statusPedido?: 'em_entrega' | 'entregue') {
    const antes = await obter(id, ctx)
    await prisma.$transaction(async (tx) => {
      const depois = await tx.entrega.update({ where: { id }, data })
      if (statusPedido && antes.pedido.status !== 'cancelado') {
        await tx.pedido.update({ where: { id: antes.pedidoId }, data: { status: statusPedido } })
        await registrarAuditoria(tx, { tabela: 'pedidos', registroId: antes.pedidoId, acao: 'editar', antes: { status: antes.pedido.status }, depois: { status: statusPedido }, usuarioId: ctx.usuarioId })
      }
      await registrarAuditoria(tx, { tabela: 'entregas', registroId: id, acao: 'editar', antes, depois, usuarioId: ctx.usuarioId })
    })
    avisar(antes.pedidoId)
    return obter(id, ctx)
  }

  return {
    async listar(q: z.output<typeof entregasQuerySchema>, ctx: ContextoUsuario) {
      const where: Prisma.EntregaWhereInput = {
        pedido: escopoProprio(ctx, 'vendedorId'),
        ...(q.status ? { status: q.status } : { status: { in: ['pendente', 'agendada'] } }),
        ...(q.de || q.ate
          ? { dataAgendada: { ...(q.de ? { gte: new Date(`${q.de}T00:00:00-03:00`) } : {}), ...(q.ate ? { lte: new Date(`${q.ate}T23:59:59-03:00`) } : {}) } }
          : {}),
        ...(q.busca ? { OR: [{ pedido: { numero: { contains: q.busca, mode: 'insensitive' } } }, { pedido: { cliente: { nome: { contains: q.busca, mode: 'insensitive' } } } }] } : {}),
      }
      const pag = paginacao(q, ['dataAgendada', 'createdAt'] as const, { campo: 'dataAgendada', direcao: 'asc' })
      const [total, data] = await prisma.$transaction([prisma.entrega.count({ where }), prisma.entrega.findMany({ where, ...pag, include: incluir })])
      return paginado(data, total, q)
    },

    async criar(pedidoId: string, dados: z.output<typeof entregaSchema>, ctx: ContextoUsuario) {
      const pedido = await prisma.pedido.findFirst({ where: { id: pedidoId, ...escopoProprio(ctx, 'vendedorId') } })
      if (!pedido) throw AppError.naoEncontrado('Pedido não encontrado.')
      if (['cancelado', 'entregue'].includes(pedido.status)) throw AppError.regraNegocio('Pedido encerrado.')
      const entrega = await prisma.$transaction(async (tx) => {
        const e = await tx.entrega.create({
          data: {
            pedidoId,
            tipo: dados.tipo,
            dataAgendada: dados.dataAgendada ? new Date(dados.dataAgendada) : null,
            responsavelId: dados.responsavelId ?? null,
            endereco: dados.endereco ?? (dados.tipo === 'retirada' ? null : pedido.enderecoEntrega),
            observacao: dados.observacao ?? null,
            status: dados.dataAgendada ? 'agendada' : 'pendente',
          },
        })
        await registrarAuditoria(tx, { tabela: 'entregas', registroId: e.id, acao: 'criar', depois: e, usuarioId: ctx.usuarioId })
        return e
      })
      avisar(pedidoId)
      return obter(entrega.id, ctx)
    },

    atualizar: (id: string, dados: z.output<typeof entregaSchema>, ctx: ContextoUsuario) =>
      alterar(id, ctx, {
        tipo: dados.tipo,
        dataAgendada: dados.dataAgendada ? new Date(dados.dataAgendada) : null,
        responsavelId: dados.responsavelId ?? null,
        endereco: dados.endereco ?? null,
        observacao: dados.observacao ?? null,
        status: dados.dataAgendada ? 'agendada' : 'pendente',
      }),

    async saiu(id: string, ctx: ContextoUsuario) {
      const e = await obter(id, ctx)
      if (e.pedido.status !== 'pronto') throw AppError.regraNegocio('Só pedidos prontos podem sair para entrega.')
      return alterar(id, ctx, { status: 'agendada', dataAgendada: e.dataAgendada ?? new Date() }, 'em_entrega')
    },

    async realizar(id: string, dados: z.output<typeof realizarEntregaSchema>, ctx: ContextoUsuario) {
      const e = await obter(id, ctx)
      if (['realizada', 'cancelada'].includes(e.status)) throw AppError.regraNegocio('Esta entrega já foi encerrada.')
      if (!['pronto', 'em_entrega'].includes(e.pedido.status)) throw AppError.regraNegocio('O pedido ainda não está pronto.')
      return alterar(
        id,
        ctx,
        { status: 'realizada', dataRealizada: dados.dataRealizada ? new Date(dados.dataRealizada) : new Date(), recebidoPor: dados.recebidoPor, observacao: dados.observacao ?? e.observacao },
        'entregue',
      )
    },

    async cancelar(id: string, ctx: ContextoUsuario) {
      const e = await obter(id, ctx)
      if (e.status === 'realizada') throw AppError.regraNegocio('Entrega já realizada.')
      return alterar(id, ctx, { status: 'cancelada' })
    },

    async enviarComprovante(request: FastifyRequest, id: string, ctx: ContextoUsuario) {
      await obter(id, ctx)
      const arquivo = await arquivos.receberUpload(request, { entidade: 'entrega', entidadeId: id, categoria: 'comprovante', extensoes: EXTENSOES_PERMITIDAS }, ctx.usuarioId)
      return alterar(id, ctx, { comprovanteId: arquivo.id })
    },
  }
}
