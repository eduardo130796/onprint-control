import { Prisma, type PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { EtiquetaFilaItem } from '@onprint/shared'
import { AppError } from '../../core/AppError'

type Cliente = PrismaClient | Prisma.TransactionClient

/**
 * Põe as OPs na fila de etiquetas (ignora canceladas e as que já estão pendentes).
 * Um INSERT só com ON CONFLICT no índice parcial: seguro dentro de transação e contra cliques duplos.
 * Devolve quantas entraram.
 */
export async function enfileirarEtiquetas(db: Cliente, opIds: string[], usuarioId: string | null, automatica = false): Promise<number> {
  if (opIds.length === 0) return 0
  return db.$executeRaw`
    INSERT INTO etiquetas_fila (ordem_producao_id, pedido_id, automatica, criada_por)
    SELECT op.id, op.pedido_id, ${automatica}, ${usuarioId}::uuid
    FROM ordens_producao op
    WHERE op.id = ANY(${opIds}::uuid[]) AND op.cancelada = false
    ON CONFLICT (ordem_producao_id) WHERE impressa_em IS NULL DO NOTHING`
}

const pendentes = { impressaEm: null, ordemProducao: { cancelada: false }, pedido: { status: { not: 'cancelado' as const } } } satisfies Prisma.EtiquetaFilaWhereInput

export function criarFilaEtiquetasService(app: FastifyInstance) {
  const { prisma } = app

  return {
    /** Etiquetas pendentes, agrupáveis por pedido (ordem de chegada). */
    async listar(): Promise<EtiquetaFilaItem[]> {
      const linhas = await prisma.etiquetaFila.findMany({
        where: pendentes,
        orderBy: [{ criadaEm: 'asc' }, { pedido: { numero: 'asc' } }, { ordemProducao: { numero: 'asc' } }],
        take: 500,
        include: {
          ordemProducao: { select: { numero: true, quantidade: true, etapaAtual: true, pedidoItem: { select: { descricao: true } } } },
          pedido: { select: { numero: true, cliente: { select: { nome: true } } } },
        },
      })
      return linhas.map((l) => ({
        id: l.id,
        ordemProducaoId: l.ordemProducaoId,
        pedidoId: l.pedidoId,
        criadaEm: l.criadaEm.toISOString(),
        automatica: l.automatica,
        op: { numero: l.ordemProducao.numero, quantidade: l.ordemProducao.quantidade.toString(), etapaAtual: l.ordemProducao.etapaAtual },
        pedido: { numero: l.pedido.numero, cliente: l.pedido.cliente.nome },
        item: l.ordemProducao.pedidoItem.descricao,
      }))
    },

    /** Adiciona OPs avulsas e/ou todas as OPs ativas dos pedidos informados. */
    async adicionar(opIds: string[], pedidoIds: string[], usuarioId: string) {
      const dosPedidos = pedidoIds.length
        ? await prisma.ordemProducao.findMany({ where: { pedidoId: { in: pedidoIds }, cancelada: false }, select: { id: true } })
        : []
      const todas = [...new Set([...opIds, ...dosPedidos.map((o) => o.id)])]
      if (todas.length === 0) throw AppError.regraNegocio('Nenhuma OP para etiquetar nesses pedidos.')
      const adicionadas = await enfileirarEtiquetas(prisma, todas, usuarioId)
      return { adicionadas, jaNaFila: todas.length - adicionadas }
    },

    async remover(id: string) {
      const { count } = await prisma.etiquetaFila.deleteMany({ where: { id, impressaEm: null } })
      if (count === 0) throw AppError.naoEncontrado('Etiqueta não está na fila.')
    },

    /** Tira da fila as etiquetas impressas (ficam registradas com a data). */
    async marcarImpressas(ids: string[]) {
      const { count } = await prisma.etiquetaFila.updateMany({ where: { id: { in: ids }, impressaEm: null }, data: { impressaEm: new Date() } })
      return { marcadas: count }
    },

    /** Desfaz o "marcar como impressas": volta para a fila, salvo se a OP já tiver outra pendente. */
    async voltarParaFila(ids: string[]) {
      const linhas = await prisma.etiquetaFila.findMany({ where: { id: { in: ids }, impressaEm: { not: null } }, select: { id: true, ordemProducaoId: true } })
      let voltaram = 0
      for (const l of linhas) {
        const jaPendente = await prisma.etiquetaFila.count({ where: { ordemProducaoId: l.ordemProducaoId, impressaEm: null } })
        if (jaPendente) continue
        // Corrida com outra inclusão da mesma OP: o índice único recusa e a pendente nova vale
        const ok = await prisma.etiquetaFila.update({ where: { id: l.id }, data: { impressaEm: null } }).then(() => true, () => false)
        if (ok) voltaram++
      }
      return { voltaram }
    },
  }
}
