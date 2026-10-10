import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { solicitacaoSchema, solicitacoesQuerySchema } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import type { ContextoUsuario } from '../../core/escopo'
import { proximoNumero } from '../../core/numeracao'
import { paginacao, paginado } from '../../core/paginacao'
import { comConflitoAmigavel } from '../../core/prisma-erros'

type Dados = z.output<typeof solicitacaoSchema>
type Query = z.output<typeof solicitacoesQuerySchema>

const incluir = {
  cliente: { select: { id: true, nome: true, situacao: true, whatsapp: true } },
  responsavel: { select: { id: true, nome: true } },
  orcamentos: { select: { id: true, numero: true, status: true }, orderBy: { createdAt: 'asc' } },
  // Itens da lista de orçamento da vitrine (vazio nas digitadas no sistema)
  itens: {
    select: { id: true, produtoId: true, descricao: true, quantidade: true, largura: true, altura: true, acabamentos: true, observacao: true },
    orderBy: { ordem: 'asc' },
  },
} satisfies Prisma.SolicitacaoOrcamentoInclude

/** Sem ver_todos: vê as próprias e as ainda sem responsável (fila de atendimento). */
function escopo(ctx: ContextoUsuario): Prisma.SolicitacaoOrcamentoWhereInput {
  return ctx.veTodos ? {} : { OR: [{ responsavelId: ctx.usuarioId }, { responsavelId: null }] }
}

export function criarSolicitacoesService(app: FastifyInstance) {
  const { prisma } = app

  async function obter(id: string, ctx: ContextoUsuario) {
    const s = await prisma.solicitacaoOrcamento.findFirst({ where: { id, ...escopo(ctx) }, include: incluir })
    if (!s) throw AppError.naoEncontrado('Solicitação não encontrada.')
    return s
  }

  return {
    obter,

    async listar(q: Query, ctx: ContextoUsuario) {
      const texto = q.busca ? { contains: q.busca, mode: 'insensitive' as const } : undefined
      const where: Prisma.SolicitacaoOrcamentoWhereInput = {
        AND: [
          escopo(ctx),
          q.status ? { status: q.status } : {},
          q.clienteId ? { clienteId: q.clienteId } : {},
          q.origem ? { origem: q.origem } : {},
          texto ? { OR: [{ numero: texto }, { descricao: texto }, { cliente: { nome: texto } }] } : {},
        ],
      }
      const pag = paginacao(q, ['createdAt', 'numero', 'prazoDesejado'] as const, { campo: 'createdAt', direcao: 'desc' })
      const [total, data] = await prisma.$transaction([
        prisma.solicitacaoOrcamento.count({ where }),
        prisma.solicitacaoOrcamento.findMany({ where, ...pag, include: incluir }),
      ])
      return paginado(data, total, q)
    },

    /** Cria a solicitação; se vier "novoCliente", faz o pré-cadastro na mesma transação. */
    async criar(dados: Dados, ctx: ContextoUsuario) {
      if (dados.clienteId) {
        const c = await prisma.cliente.findUnique({ where: { id: dados.clienteId } })
        if (!c?.ativo) throw AppError.regraNegocio('Cliente inválido ou desativado.')
      }
      return comConflitoAmigavel(
        () =>
          prisma.$transaction(async (tx) => {
            let clienteId = dados.clienteId ?? null
            if (dados.novoCliente) {
              const cliente = await tx.cliente.create({
                data: { ...dados.novoCliente, origem: dados.origem, situacao: 'pre_cadastro', vendedorId: ctx.usuarioId, createdBy: ctx.usuarioId },
              })
              await registrarAuditoria(tx, { tabela: 'clientes', registroId: cliente.id, acao: 'criar', depois: cliente, usuarioId: ctx.usuarioId })
              clienteId = cliente.id
            }
            const s = await tx.solicitacaoOrcamento.create({
              data: {
                numero: await proximoNumero(tx, 'solicitacao'),
                clienteId,
                origem: dados.origem,
                descricao: dados.descricao,
                prazoDesejado: dados.prazoDesejado ? new Date(`${dados.prazoDesejado}T00:00:00Z`) : null,
                responsavelId: dados.responsavelId ?? ctx.usuarioId,
                status: 'em_atendimento',
                createdBy: ctx.usuarioId,
              },
              include: incluir,
            })
            await registrarAuditoria(tx, { tabela: 'solicitacoes_orcamento', registroId: s.id, acao: 'criar', depois: s, usuarioId: ctx.usuarioId })
            return s
          }),
        { whatsapp: 'Já existe um cliente com este WhatsApp. Selecione-o na busca.' },
      )
    },

    async assumir(id: string, ctx: ContextoUsuario) {
      const antes = await obter(id, ctx)
      if (['orcada', 'descartada'].includes(antes.status)) throw AppError.regraNegocio('Solicitação já encerrada.')
      return prisma.$transaction(async (tx) => {
        const s = await tx.solicitacaoOrcamento.update({ where: { id }, data: { responsavelId: ctx.usuarioId, status: 'em_atendimento' }, include: incluir })
        await registrarAuditoria(tx, { tabela: 'solicitacoes_orcamento', registroId: id, acao: 'editar', antes, depois: s, usuarioId: ctx.usuarioId })
        return s
      })
    },

    async descartar(id: string, motivo: string, ctx: ContextoUsuario) {
      const antes = await obter(id, ctx)
      if (antes.status === 'orcada') throw AppError.regraNegocio('Solicitação já orçada não pode ser descartada.')
      return prisma.$transaction(async (tx) => {
        const s = await tx.solicitacaoOrcamento.update({ where: { id }, data: { status: 'descartada', motivoDescarte: motivo }, include: incluir })
        await registrarAuditoria(tx, { tabela: 'solicitacoes_orcamento', registroId: id, acao: 'editar', antes, depois: s, usuarioId: ctx.usuarioId })
        return s
      })
    },
  }
}
