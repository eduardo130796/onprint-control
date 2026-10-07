import type { Prisma } from '@prisma/client'
import { STATUS_PEDIDO_SEM_ATRASO, hojeISO } from '@onprint/shared'
import { incluirArte } from '../artes/artes.service'

export const incluirResumo = {
  cliente: { select: { id: true, nome: true, whatsapp: true, telefone: true } },
  vendedor: { select: { id: true, nome: true } },
  orcamento: { select: { id: true, numero: true } },
  itens: { orderBy: { ordem: 'asc' }, select: { descricao: true, quantidade: true, artes: { orderBy: { versao: 'desc' }, take: 1, select: { status: true } } } },
  ordensProducao: { where: { cancelada: false }, select: { etapaAtual: true } },
} satisfies Prisma.PedidoInclude

export const incluirDetalhe = {
  cliente: { select: { id: true, nome: true, whatsapp: true, telefone: true } },
  vendedor: { select: { id: true, nome: true } },
  orcamento: { select: { id: true, numero: true } },
  itens: {
    orderBy: { ordem: 'asc' },
    include: {
      produto: { select: { id: true, codigo: true, nome: true } },
      acabamentos: { select: { id: true, nome: true, tipoCobranca: true, valor: true } },
      artes: { orderBy: { versao: 'desc' }, include: incluirArte },
      ordensProducao: { orderBy: { createdAt: 'asc' }, select: { id: true, numero: true, etapaAtual: true, cancelada: true } },
    },
  },
  contasReceber: { orderBy: { parcela: 'asc' }, select: { id: true, descricao: true, parcela: true, totalParcelas: true, valor: true, valorPago: true, vencimento: true, status: true } },
  comissoes: { select: { id: true, valor: true, percentual: true, status: true, vendedor: { select: { id: true, nome: true } } } },
  entregas: { orderBy: { createdAt: 'desc' }, include: { responsavel: { select: { id: true, nome: true } } } },
} satisfies Prisma.PedidoInclude

type Resumo = Prisma.PedidoGetPayload<{ include: typeof incluirResumo }>

export function atrasado(p: { status: string; dataPrevistaEntrega: Date }, hoje = hojeISO()) {
  return !(STATUS_PEDIDO_SEM_ATRASO as readonly string[]).includes(p.status) && p.dataPrevistaEntrega.toISOString().slice(0, 10) < hoje
}

/** Lista/kanban: contagem de artes aprovadas e OPs concluídas no lugar das relações completas. */
export function formatarResumo(p: Resumo) {
  const { itens, ordensProducao, ...resto } = p
  return {
    ...resto,
    atrasado: atrasado(p),
    resumo: {
      itens: itens.length,
      artes: itens.length,
      artesAprovadas: itens.filter((i) => i.artes[0]?.status === 'aprovada').length,
      ops: ordensProducao.length,
      opsConcluidas: ordensProducao.filter((o) => o.etapaAtual === 'concluido').length,
      /** Os 3 primeiros itens ("2 × Banner 2×1 m") para o cartão do kanban */
      principais: itens.slice(0, 3).map((i) => `${Number(i.quantidade).toLocaleString('pt-BR')} × ${i.descricao}`),
    },
  }
}
