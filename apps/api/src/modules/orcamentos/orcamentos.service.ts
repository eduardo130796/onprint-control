import { randomBytes } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { STATUS_ORCAMENTO_ABERTOS, adicionarDias, hojeISO, type orcamentoSchema, type orcamentosQuerySchema } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { escopoProprio, type ContextoUsuario } from '../../core/escopo'
import { proximoNumero } from '../../core/numeracao'
import { paginacao, paginado } from '../../core/paginacao'
import { itensParaCriar, recalcularItens, totalDoOrcamento } from './calculo'
import { incluirDetalhe, incluirResumo } from './consultas'

type Dados = z.output<typeof orcamentoSchema>
type Query = z.output<typeof orcamentosQuerySchema>

export const dataBanco = (iso: string) => new Date(`${iso}T00:00:00Z`)
export const gerarToken = () => randomBytes(24).toString('base64url')

export function criarOrcamentosService(app: FastifyInstance) {
  const { prisma } = app

  async function obter(id: string, ctx: ContextoUsuario) {
    const o = await prisma.orcamento.findFirst({ where: { id, ...escopoProprio(ctx, 'vendedorId') }, include: incluirDetalhe })
    if (!o) throw AppError.naoEncontrado('Orçamento não encontrado.')
    return o
  }

  function garantirAberto(status: string) {
    if (!(STATUS_ORCAMENTO_ABERTOS as readonly string[]).includes(status)) {
      throw AppError.regraNegocio('Só orçamentos em rascunho, enviados ou em negociação podem ser alterados.')
    }
  }

  /** Valida cliente, vendedor e validade e recalcula todos os valores. */
  async function preparar(dados: Dados, ctx: ContextoUsuario) {
    const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId } })
    if (!cliente?.ativo) throw AppError.regraNegocio('Cliente inválido ou desativado.')
    if (cliente.situacao === 'bloqueado') throw AppError.regraNegocio('Cliente bloqueado: não é possível orçar.')

    const vendedorId = dados.vendedorId ?? ctx.usuarioId
    if (vendedorId !== ctx.usuarioId && !ctx.veTodos) throw AppError.semPermissao('Você só pode criar orçamentos em seu nome.')
    const vendedor = await prisma.usuario.findUnique({ where: { id: vendedorId } })
    if (!vendedor?.ativo) throw AppError.regraNegocio('Vendedor inválido ou desativado.')

    const empresa = await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' } })
    const hoje = hojeISO()
    const validade = dados.validade ?? adicionarDias(hoje, empresa?.validadeOrcamentoDias ?? 7)
    if (validade < hoje) throw AppError.regraNegocio('A validade não pode ser anterior a hoje.')

    const calculo = await recalcularItens(prisma, dados.itens, ctx)
    const total = totalDoOrcamento(calculo.subtotal, dados.desconto, dados.acrescimo, dados.frete)
    return {
      calculo,
      cabecalho: {
        clienteId: dados.clienteId,
        solicitacaoId: dados.solicitacaoId ?? null,
        desconto: dados.desconto,
        acrescimo: dados.acrescimo,
        frete: dados.frete,
        observacoes: dados.observacoes ?? null,
        observacoesInternas: dados.observacoesInternas ?? null,
        vendedorId,
        condicoes: dados.condicoes ?? empresa?.condicoesPadrao ?? null,
        validade: dataBanco(validade),
        subtotal: calculo.subtotal,
        total,
        custoEstimado: calculo.custoEstimado,
        prazoDias: calculo.prazoDias,
      },
    }
  }

  async function mudarStatus(
    id: string,
    ctx: ContextoUsuario,
    permitidos: string[],
    data: Prisma.OrcamentoUpdateInput,
    mensagem: string,
  ) {
    const antes = await obter(id, ctx)
    if (!permitidos.includes(antes.status)) throw AppError.regraNegocio(mensagem)
    return prisma.$transaction(async (tx) => {
      const o = await tx.orcamento.update({ where: { id }, data, include: incluirDetalhe })
      await registrarAuditoria(tx, { tabela: 'orcamentos', registroId: id, acao: 'editar', antes: { status: antes.status }, depois: { status: o.status }, usuarioId: ctx.usuarioId })
      return o
    })
  }

  return {
    obter,

    async listar(q: Query, ctx: ContextoUsuario) {
      const texto = q.busca ? { contains: q.busca, mode: 'insensitive' as const } : undefined
      const where: Prisma.OrcamentoWhereInput = {
        ...escopoProprio(ctx, 'vendedorId'),
        ...(q.status ? { status: q.status } : {}),
        ...(q.clienteId ? { clienteId: q.clienteId } : {}),
        ...(q.vendedorId && ctx.veTodos ? { vendedorId: q.vendedorId } : {}),
        ...(texto ? { OR: [{ numero: texto }, { cliente: { nome: texto } }, { cliente: { fantasia: texto } }] } : {}),
      }
      const pag = paginacao(q, ['createdAt', 'numero', 'total', 'validade'] as const, { campo: 'createdAt', direcao: 'desc' })
      const [total, data] = await prisma.$transaction([
        prisma.orcamento.count({ where }),
        prisma.orcamento.findMany({ where, ...pag, include: incluirResumo }),
      ])
      return paginado(data, total, q)
    },

    async criar(dados: Dados, ctx: ContextoUsuario) {
      const { calculo, cabecalho } = await preparar(dados, ctx)
      if (dados.solicitacaoId) {
        const s = await prisma.solicitacaoOrcamento.findUnique({ where: { id: dados.solicitacaoId } })
        if (!s || s.status === 'descartada') throw AppError.regraNegocio('Solicitação inválida ou descartada.')
      }
      return prisma.$transaction(async (tx) => {
        const o = await tx.orcamento.create({
          data: {
            ...cabecalho,
            numero: await proximoNumero(tx, 'orcamento'),
            tokenPublico: gerarToken(),
            createdBy: ctx.usuarioId,
            itens: { create: itensParaCriar(calculo.itens) },
          },
          include: incluirDetalhe,
        })
        if (dados.solicitacaoId) {
          await tx.solicitacaoOrcamento.update({ where: { id: dados.solicitacaoId }, data: { status: 'orcada', clienteId: dados.clienteId } })
        }
        await registrarAuditoria(tx, { tabela: 'orcamentos', registroId: o.id, acao: 'criar', depois: o, usuarioId: ctx.usuarioId })
        return o
      })
    },

    async atualizar(id: string, dados: Dados, ctx: ContextoUsuario) {
      const antes = await obter(id, ctx)
      garantirAberto(antes.status)
      const { calculo, cabecalho } = await preparar({ ...dados, solicitacaoId: antes.solicitacaoId }, ctx)
      return prisma.$transaction(async (tx) => {
        await tx.orcamentoItem.deleteMany({ where: { orcamentoId: id } })
        const o = await tx.orcamento.update({
          where: { id },
          data: { ...cabecalho, itens: { create: itensParaCriar(calculo.itens) } },
          include: incluirDetalhe,
        })
        await registrarAuditoria(tx, { tabela: 'orcamentos', registroId: id, acao: 'editar', antes, depois: o, usuarioId: ctx.usuarioId })
        return o
      })
    },

    marcarEnviado: (id: string, ctx: ContextoUsuario) =>
      mudarStatus(id, ctx, ['rascunho'], { status: 'enviado', enviadoEm: new Date() }, 'Só rascunhos podem ser marcados como enviados.'),

    emNegociacao: (id: string, ctx: ContextoUsuario) =>
      mudarStatus(id, ctx, ['enviado'], { status: 'em_negociacao' }, 'Só orçamentos enviados podem ir para negociação.'),

    aprovarInterno: (id: string, nome: string, ctx: ContextoUsuario) =>
      mudarStatus(
        id,
        ctx,
        [...STATUS_ORCAMENTO_ABERTOS],
        { status: 'aprovado', aprovadoEm: new Date(), aprovadoPorNome: `${nome} (registrado internamente)`, aprovadoIp: null },
        'Este orçamento não pode ser aprovado.',
      ),

    recusar: (id: string, motivo: string, ctx: ContextoUsuario) =>
      mudarStatus(id, ctx, [...STATUS_ORCAMENTO_ABERTOS], { status: 'recusado', recusadoEm: new Date(), motivoRecusa: motivo }, 'Este orçamento não pode ser recusado.'),

    /** Volta para negociação; se a validade já passou, renova pelo prazo padrão da empresa. */
    async reabrir(id: string, ctx: ContextoUsuario) {
      const antes = await obter(id, ctx)
      const empresa = await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' } })
      const hoje = hojeISO()
      const vencida = antes.validade.toISOString().slice(0, 10) < hoje
      return mudarStatus(
        id,
        ctx,
        ['aprovado', 'recusado', 'expirado'],
        {
          status: 'em_negociacao',
          aprovadoEm: null,
          aprovadoPorNome: null,
          aprovadoIp: null,
          recusadoEm: null,
          motivoRecusa: null,
          ...(vencida ? { validade: dataBanco(adicionarDias(hoje, empresa?.validadeOrcamentoDias ?? 7)) } : {}),
        },
        'Só orçamentos aprovados, recusados ou expirados podem ser reabertos.',
      )
    },

    /** Novo rascunho com os mesmos itens (valores recalculados com o cadastro atual). */
    async duplicar(id: string, ctx: ContextoUsuario) {
      const o = await obter(id, ctx)
      return this.criar(
        {
          clienteId: o.clienteId,
          vendedorId: ctx.usuarioId,
          solicitacaoId: null,
          validade: null,
          desconto: o.desconto.toString(),
          acrescimo: o.acrescimo.toString(),
          frete: o.frete.toString(),
          condicoes: o.condicoes,
          observacoes: o.observacoes,
          observacoesInternas: o.observacoesInternas,
          itens: o.itens.map((i) => ({
            produtoId: i.produtoId,
            descricao: i.descricao,
            quantidade: i.quantidade.toString(),
            largura: i.largura?.toString() ?? null,
            altura: i.altura?.toString() ?? null,
            precoUnitario: i.precoUnitario.toString(),
            acabamentoIds: i.acabamentos.map((a) => a.acabamentoId),
            desconto: i.desconto.toString(),
            observacao: i.observacao,
          })),
        },
        ctx,
      )
    },
  }
}

export type OrcamentosService = ReturnType<typeof criarOrcamentosService>
