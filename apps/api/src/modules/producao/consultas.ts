import type { Prisma } from '@prisma/client'
import { STATUS_PEDIDO_SEM_ATRASO, hojeISO } from '@onprint/shared'

export const incluirOp = {
  pedido: { select: { id: true, numero: true, dataPrevistaEntrega: true, status: true, cliente: { select: { id: true, nome: true } } } },
  pedidoItem: {
    select: {
      id: true,
      descricao: true,
      produto: { select: { id: true, nome: true } },
      artes: { orderBy: { versao: 'desc' }, take: 1, select: { status: true, miniaturaId: true, versao: true } },
    },
  },
  maquina: { select: { id: true, nome: true } },
  responsavel: { select: { id: true, nome: true } },
} satisfies Prisma.OrdemProducaoInclude

type OpComRelacoes = Prisma.OrdemProducaoGetPayload<{ include: typeof incluirOp }>

/** Formato de saída: item e arte achatados + indicador de atraso. */
/** Gera a URL assinada de um arquivo (miniatura da arte no card do kanban). */
export type UrlArquivo = (arquivoId: string) => string

export function formatarOp(op: OpComRelacoes, urlArquivo?: UrlArquivo, hoje = hojeISO()) {
  const { pedidoItem, ...resto } = op
  const prazo = (op.dataFimPrevista ?? op.pedido.dataPrevistaEntrega).toISOString().slice(0, 10)
  return {
    ...resto,
    item: { id: pedidoItem.id, descricao: pedidoItem.descricao, produto: pedidoItem.produto },
    arte: pedidoItem.artes[0]
      ? { ...pedidoItem.artes[0], miniaturaUrl: pedidoItem.artes[0].miniaturaId && urlArquivo ? urlArquivo(pedidoItem.artes[0].miniaturaId) : null }
      : null,
    atrasada: op.etapaAtual !== 'concluido' && !op.cancelada && prazo < hoje && !STATUS_PEDIDO_SEM_ATRASO.includes(op.pedido.status),
  }
}
