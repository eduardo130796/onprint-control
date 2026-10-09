import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import {
  ETAPAS_QUE_EXIGEM_ARTE,
  hojeISO,
  type apontamentoSchema,
  type moverOpSchema,
  type opAtualizacaoSchema,
  type opsQuerySchema,
} from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import type { ContextoUsuario } from '../../core/escopo'
import { paginacao, paginado } from '../../core/paginacao'
import { avisarMudancaPedido, sincronizarStatusPedido, type MudancaPedido } from '../pedidos/automacao'
import { enfileirarEtiquetas } from '../etiquetas/fila.service'
import { formatarOp, incluirOp } from './consultas'
import { estimarHoras, gerarOpsDoPedido } from './geracao'

type Query = z.output<typeof opsQuerySchema>
const dataBanco = (iso: string | null | undefined) => (iso ? new Date(`${iso}T00:00:00Z`) : null)

/**
 * Chamado dentro da transação quando a OP chega em "concluído" (baixa de insumos, Fase 5).
 * Pode devolver uma função para rodar depois do commit (avisos em tempo real).
 */
export type AoConcluirOp = (tx: Prisma.TransactionClient, opId: string, usuarioId: string) => Promise<(() => void) | void>

export function criarOpsService(app: FastifyInstance, aoConcluir: AoConcluirOp = async () => {}) {
  const { prisma } = app
  const url = (arquivoId: string) => app.storage.gerarUrlTemporaria(arquivoId, 3600)

  async function obterBase(id: string) {
    const op = await prisma.ordemProducao.findUnique({ where: { id }, include: incluirOp })
    if (!op) throw AppError.naoEncontrado('Ordem de produção não encontrada.')
    return op
  }

  function avisar(opId: string, pedidoId: string, mudanca: MudancaPedido | null) {
    app.tempoReal.emitir('producao', 'op:atualizada', { id: opId, pedidoId })
    avisarMudancaPedido(app, mudanca, pedidoId)
  }

  return {
    async listar(q: Query) {
      const hoje = new Date(`${hojeISO()}T00:00:00Z`)
      const tresDiasAtras = new Date(Date.now() - 3 * 86_400_000)
      const texto = q.busca ? { contains: q.busca, mode: 'insensitive' as const } : undefined
      const where: Prisma.OrdemProducaoWhereInput = {
        cancelada: false,
        ...(q.kanban === 'true'
          ? { OR: [{ etapaAtual: { not: 'concluido' } }, { dataFimReal: { gte: tresDiasAtras } }] }
          : q.incluirConcluidas === 'true' || q.etapa === 'concluido'
            ? {}
            : { etapaAtual: { not: 'concluido' } }),
        ...(q.etapa ? { etapaAtual: q.etapa } : {}),
        ...(q.maquinaId ? { maquinaId: q.maquinaId } : {}),
        ...(q.responsavelId ? { responsavelId: q.responsavelId } : {}),
        ...(q.prioridade ? { prioridade: q.prioridade } : {}),
        ...(q.pedidoId ? { pedidoId: q.pedidoId } : {}),
        ...(q.atrasadas === 'true' ? { etapaAtual: { not: 'concluido' }, pedido: { dataPrevistaEntrega: { lt: hoje } } } : {}),
        ...(texto ? { AND: [{ OR: [{ numero: texto }, { pedido: { numero: texto } }, { pedido: { cliente: { nome: texto } } }, { pedidoItem: { descricao: texto } }] }] } : {}),
      }
      const pag = paginacao(q, ['ordemKanban', 'numero', 'dataFimPrevista', 'createdAt'] as const, { campo: 'ordemKanban', direcao: 'asc' })
      const [total, data] = await prisma.$transaction([
        prisma.ordemProducao.count({ where }),
        prisma.ordemProducao.findMany({ where, ...pag, include: incluirOp }),
      ])
      return paginado(data.map((op) => formatarOp(op, url)), total, q)
    },

    async obter(id: string) {
      const op = await prisma.ordemProducao.findUnique({
        where: { id },
        include: {
          ...incluirOp,
          historico: { orderBy: { createdAt: 'desc' }, include: { usuario: { select: { id: true, nome: true } } } },
          apontamentos: {
            orderBy: { inicio: 'desc' },
            include: {
              processo: { select: { id: true, nome: true } },
              maquina: { select: { id: true, nome: true } },
              operador: { select: { id: true, nome: true } },
            },
          },
        },
      })
      if (!op) throw AppError.naoEncontrado('Ordem de produção não encontrada.')
      const [acabamentos, consumos] = await Promise.all([
        prisma.pedidoItemAcabamento.findMany({ where: { itemId: op.pedidoItemId }, select: { nome: true } }),
        // Insumos baixados do estoque quando a OP foi concluída
        prisma.estoqueMovimentacao.findMany({
          where: { opId: id },
          orderBy: { createdAt: 'asc' },
          select: { id: true, quantidade: true, custoUnitario: true, createdAt: true, produto: { select: { id: true, nome: true, unidadeMedida: { select: { sigla: true } } } } },
        }),
      ])
      const { historico, apontamentos, ...base } = op
      return {
        ...formatarOp(base, url),
        historico,
        apontamentos,
        acabamentos: acabamentos.map((a) => a.nome),
        consumos: consumos.map(({ produto: { unidadeMedida, ...produto }, ...c }) => ({ ...c, produto: { ...produto, unidade: unidadeMedida?.sigla ?? null } })),
      }
    },

    /**
     * Move a OP no kanban: grava o histórico com o tempo na etapa anterior, exige arte aprovada
     * a partir da impressão (override só com producao:aprovar, registrado na auditoria) e
     * atualiza o status do pedido (pode virar "pronto").
     */
    async mover(id: string, dados: z.output<typeof moverOpSchema>, ctx: ContextoUsuario) {
      const op = await obterBase(id)
      if (op.cancelada) throw AppError.regraNegocio('Esta OP foi cancelada junto com o pedido.')
      const mudouEtapa = op.etapaAtual !== dados.etapa
      const arteAprovada = op.pedidoItem.artes[0]?.status === 'aprovada'
      // A trava vale ao ENTRAR na zona que exige arte; depois de liberada (override) a OP segue sem nova liberação
      const jaLiberada = ETAPAS_QUE_EXIGEM_ARTE.includes(op.etapaAtual)
      const exigeArte = mudouEtapa && ETAPAS_QUE_EXIGEM_ARTE.includes(dados.etapa) && !jaLiberada && !arteAprovada
      if (exigeArte && !dados.override) {
        throw AppError.regraNegocio('A arte deste item ainda não foi aprovada. A OP não pode ir para impressão.', { motivo: 'ARTE_NAO_APROVADA' })
      }
      if (exigeArte && !ctx.podeAprovar) throw AppError.semPermissao('Só um gerente pode liberar a impressão sem arte aprovada.')
      if (exigeArte && !dados.motivo) throw AppError.regraNegocio('Informe o motivo da liberação sem arte aprovada.')

      const agora = new Date()
      const aposCommit: { acao?: (() => void) | void } = {}
      const mudanca = await prisma.$transaction(async (tx) => {
        if (mudouEtapa) {
          await tx.opEtapaHistorico.create({
            data: {
              opId: id,
              etapaDe: op.etapaAtual,
              etapaPara: dados.etapa,
              usuarioId: ctx.usuarioId,
              segundosNaEtapa: Math.max(0, Math.round((agora.getTime() - op.entrouEtapaEm.getTime()) / 1000)),
              override: exigeArte,
              motivo: exigeArte ? dados.motivo : null,
            },
          })
          await tx.ordemProducao.update({
            where: { id },
            data: {
              etapaAtual: dados.etapa,
              entrouEtapaEm: agora,
              dataInicioReal: op.dataInicioReal ?? (dados.etapa !== 'fila' ? agora : null),
              dataFimReal: dados.etapa === 'concluido' ? agora : null,
            },
          })
          if (exigeArte) {
            await registrarAuditoria(tx, {
              tabela: 'ordens_producao',
              registroId: id,
              acao: 'override',
              antes: { etapa: op.etapaAtual, arte: op.pedidoItem.artes[0]?.status ?? null },
              depois: { etapa: dados.etapa, motivo: dados.motivo },
              usuarioId: ctx.usuarioId,
            })
          }
          if (dados.etapa === 'concluido') {
            aposCommit.acao = await aoConcluir(tx, id, ctx.usuarioId)
            // Pronta para entregar: a etiqueta entra sozinha na fila (se já não estiver pendente)
            await enfileirarEtiquetas(tx, [id], ctx.usuarioId, true)
          } else if (op.etapaAtual === 'concluido') {
            // Voltou da conclusão: sai da fila a etiqueta que tinha entrado sozinha (a adicionada à mão fica)
            await tx.etiquetaFila.deleteMany({ where: { ordemProducaoId: id, impressaEm: null, automatica: true } })
          }
        }
        if (dados.ordemIds.length === 0) {
          // Sem a ordem da tela (ex.: mudança pela página da OP): vai para o fim da coluna
          const ultima = await tx.ordemProducao.aggregate({ where: { etapaAtual: dados.etapa, id: { not: id } }, _max: { ordemKanban: true } })
          await tx.ordemProducao.update({ where: { id }, data: { ordemKanban: (ultima._max.ordemKanban ?? 0) + 1 } })
        } else {
          // Reordena a coluna de destino conforme a ordem vista na tela
          const ids = dados.ordemIds.includes(id) ? dados.ordemIds : [...dados.ordemIds, id]
          for (const [indice, opId] of ids.entries()) {
            await tx.ordemProducao.updateMany({ where: { id: opId, etapaAtual: dados.etapa }, data: { ordemKanban: indice + 1 } })
          }
        }
        return mudouEtapa ? sincronizarStatusPedido(tx, op.pedidoId, ctx.usuarioId) : null
      })
      avisar(id, op.pedidoId, mudanca)
      aposCommit.acao?.()
      return { op: formatarOp(await obterBase(id), url), pedido: mudanca }
    },

    /** Reprogramação (PCP): máquina, responsável, prioridade, datas e observações. */
    async atualizar(id: string, dados: z.output<typeof opAtualizacaoSchema>, ctx: ContextoUsuario) {
      const antes = await obterBase(id)
      let horasEstimadas = antes.horasEstimadas.toString()
      if (dados.maquinaId !== antes.maquinaId) {
        const maquina = dados.maquinaId ? await prisma.maquina.findUnique({ where: { id: dados.maquinaId } }) : null
        if (dados.maquinaId && !maquina?.ativo) throw AppError.regraNegocio('Máquina inválida ou desativada.')
        if (maquina?.velocidadeM2Hora) horasEstimadas = estimarHoras(antes.areaM2.toString(), maquina.velocidadeM2Hora.toString(), 0)
      }
      const op = await prisma.$transaction(async (tx) => {
        const atualizada = await tx.ordemProducao.update({
          where: { id },
          data: {
            maquinaId: dados.maquinaId ?? null,
            responsavelId: dados.responsavelId ?? null,
            prioridade: dados.prioridade,
            dataInicioPrevista: dataBanco(dados.dataInicioPrevista),
            dataFimPrevista: dataBanco(dados.dataFimPrevista),
            observacoes: dados.observacoes ?? null,
            horasEstimadas,
          },
          include: incluirOp,
        })
        await registrarAuditoria(tx, { tabela: 'ordens_producao', registroId: id, acao: 'editar', antes, depois: atualizada, usuarioId: ctx.usuarioId })
        return atualizada
      })
      avisar(id, op.pedidoId, null)
      return formatarOp(op, url)
    },

    async gerarParaPedido(pedidoId: string, ctx: ContextoUsuario) {
      const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } })
      if (!pedido) throw AppError.naoEncontrado('Pedido não encontrado.')
      if (pedido.status === 'cancelado') throw AppError.regraNegocio('Pedido cancelado.')
      const criadas = await prisma.$transaction((tx) => gerarOpsDoPedido(tx, pedidoId, ctx.usuarioId))
      if (criadas.length) app.tempoReal.emitir('producao', 'op:atualizada', { pedidoId })
      return { criadas: criadas.length }
    },

    async criarApontamento(opId: string, dados: z.output<typeof apontamentoSchema>, ctx: ContextoUsuario) {
      await obterBase(opId)
      const a = await prisma.opApontamento.create({
        data: {
          opId,
          processoId: dados.processoId ?? null,
          maquinaId: dados.maquinaId ?? null,
          operadorId: ctx.usuarioId,
          inicio: new Date(dados.inicio),
          fim: dados.fim ? new Date(dados.fim) : null,
          quantidadeProduzida: dados.quantidadeProduzida,
          perda: dados.perda,
          observacao: dados.observacao ?? null,
        },
      })
      app.tempoReal.emitir('producao', 'op:atualizada', { id: opId })
      return a
    },

    async removerApontamento(opId: string, apontamentoId: string) {
      const { count } = await prisma.opApontamento.deleteMany({ where: { id: apontamentoId, opId } })
      if (!count) throw AppError.naoEncontrado('Apontamento não encontrado.')
      app.tempoReal.emitir('producao', 'op:atualizada', { id: opId })
    },
  }
}

export type OpsService = ReturnType<typeof criarOpsService>
