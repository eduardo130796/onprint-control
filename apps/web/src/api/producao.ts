import type {
  AnaliseLucro,
  ArtePublica,
  ArteVersao,
  Entrega,
  EtiquetaFilaItem,
  EntregasQuery,
  EventoHistorico,
  OpsQuery,
  OrdemProducao,
  OrdemProducaoDetalhe,
  Paginado,
  PcpResumo,
  Pedido,
  PedidoAcompanhamento,
  PedidoDetalhe,
  PedidoItemDetalhe,
  RecebimentosPedido,
  PedidosQuery,
  StatusPedido,
  ViaAprovacaoArte,
} from '@onprint/shared'
import { http, qs, upload } from './http'
import type { LinkPublico } from './comercial'

/** Fase 3 da precificação: semáforo do lucro por item e do total (números só para quem vê custos). */
export type PedidoComAnalise = Omit<PedidoDetalhe, 'itens'> & { itens: (PedidoItemDetalhe & { analise?: AnaliseLucro })[]; analise?: AnaliseLucro }

/** Pedidos, artes, entregas, produção e PCP (Fase 4). */
export const pedidosApi = {
  listar: (q: PedidosQuery) => http<Paginado<Pedido>>(`/pedidos${qs(q)}`),
  obter: (id: string) => http<PedidoComAnalise>(`/pedidos/${id}`),
  recebimentos: (id: string) => http<RecebimentosPedido>(`/pedidos/${id}/recebimentos`),
  statusPersonalizado: (id: string, statusPersonalizadoId: string | null) =>
    http<PedidoDetalhe>(`/pedidos/${id}/status-personalizado`, { method: 'POST', body: { statusPersonalizadoId } }),
  atualizar: (id: string, dados: unknown) => http<PedidoDetalhe>(`/pedidos/${id}`, { method: 'PUT', body: dados }),
  mudarStatus: (id: string, status: StatusPedido) => http<PedidoDetalhe>(`/pedidos/${id}/status`, { method: 'POST', body: { status } }),
  cancelar: (id: string, motivo: string, estornarEstoque = false) =>
    http<PedidoDetalhe>(`/pedidos/${id}/cancelar`, { method: 'POST', body: { motivo, estornarEstoque } }),
  historico: (id: string) => http<EventoHistorico[]>(`/pedidos/${id}/historico`),
  gerarOps: (id: string) => http<{ criadas: number }>(`/pedidos/${id}/gerar-ops`, { method: 'POST' }),
}

export const artesApi = {
  enviarArquivo: (itemId: string, arquivo: File, aoProgredir?: (pct: number) => void) =>
    upload<ArteVersao>(`/pedidos/itens/${itemId}/artes`, arquivo, aoProgredir),
  enviarAoCliente: (id: string) => http<ArteVersao>(`/artes/${id}/enviar`, { method: 'POST' }),
  /** Aprovação registrada pela equipe: como o cliente aprovou (WhatsApp, pessoalmente...) ou interna */
  aprovar: (id: string, via: ViaAprovacaoArte, nome?: string) => http<ArteVersao>(`/artes/${id}/aprovar`, { method: 'POST', body: { via, nome } }),
  /** Marca as artes do pedido como enviadas ao cliente (avisar = false quando a mensagem já saiu pelo diálogo) */
  enviarVarias: (pedidoId: string, arteIds: string[], avisar: boolean) =>
    http<{ enviadas: number }>(`/pedidos/${pedidoId}/artes/enviar`, { method: 'POST', body: { arteIds, avisar } }),
  /** "Cliente aprovou todas as artes" */
  aprovarTodas: (pedidoId: string, via: ViaAprovacaoArte) => http<{ aprovadas: number }>(`/pedidos/${pedidoId}/artes/aprovar`, { method: 'POST', body: { via } }),
  comentar: (id: string, texto: string) => http<ArteVersao>(`/artes/${id}/comentarios`, { method: 'POST', body: { texto } }),
}

export const entregasApi = {
  listar: (q: EntregasQuery) => http<Paginado<Entrega>>(`/entregas${qs(q)}`),
  criar: (pedidoId: string, dados: unknown) => http<Entrega>(`/pedidos/${pedidoId}/entregas`, { method: 'POST', body: dados }),
  atualizar: (id: string, dados: unknown) => http<Entrega>(`/entregas/${id}`, { method: 'PUT', body: dados }),
  saiu: (id: string) => http<Entrega>(`/entregas/${id}/saiu`, { method: 'POST' }),
  realizar: (id: string, dados: unknown) => http<Entrega>(`/entregas/${id}/realizar`, { method: 'POST', body: dados }),
  cancelar: (id: string) => http<Entrega>(`/entregas/${id}/cancelar`, { method: 'POST' }),
  enviarComprovante: (id: string, arquivo: File) => upload<Entrega>(`/entregas/${id}/comprovante`, arquivo),
}

export const opsApi = {
  listar: (q: OpsQuery) => http<Paginado<OrdemProducao>>(`/producao/ops${qs(q)}`),
  maquinas: () => http<{ id: string; nome: string }[]>('/producao/maquinas'),
  etapaPersonalizada: (id: string, statusPersonalizadoId: string | null) =>
    http<OrdemProducaoDetalhe>(`/producao/ops/${id}/etapa-personalizada`, { method: 'POST', body: { statusPersonalizadoId } }),
  obter: (id: string) => http<OrdemProducaoDetalhe>(`/producao/ops/${id}`),
  mover: (id: string, dados: { etapa: string; ordemIds: string[]; override?: boolean; motivo?: string }) =>
    http<{ op: OrdemProducao }>(`/producao/ops/${id}/mover`, { method: 'POST', body: dados }),
  atualizar: (id: string, dados: unknown) => http<OrdemProducao>(`/producao/ops/${id}`, { method: 'PUT', body: dados }),
  criarApontamento: (id: string, dados: unknown) => http<unknown>(`/producao/ops/${id}/apontamentos`, { method: 'POST', body: dados }),
  removerApontamento: (id: string, apontamentoId: string) => http<void>(`/producao/ops/${id}/apontamentos/${apontamentoId}`, { method: 'DELETE' }),
}

/** Fila de etiquetas de entrega a imprimir (uma pendente por OP). */
export const filaEtiquetasApi = {
  listar: () => http<EtiquetaFilaItem[]>('/etiquetas/fila'),
  adicionar: (dados: { opIds?: string[]; pedidoIds?: string[] }) =>
    http<{ adicionadas: number; jaNaFila: number }>('/etiquetas/fila', { method: 'POST', body: dados }),
  remover: (id: string) => http<void>(`/etiquetas/fila/${id}`, { method: 'DELETE' }),
  marcarImpressas: (ids: string[]) => http<{ marcadas: number }>('/etiquetas/fila/marcar-impressas', { method: 'POST', body: { ids } }),
  voltar: (ids: string[]) => http<{ voltaram: number }>('/etiquetas/fila/voltar', { method: 'POST', body: { ids } }),
}

export const pcpApi = {
  resumo: () => http<PcpResumo>('/pcp'),
}

/** Link público da arte (sem login). */
const artePublica = (l: LinkPublico) => `/publico/${encodeURIComponent(l.empresa)}/artes/${encodeURIComponent(l.token)}`

const pedidoPublico = (l: LinkPublico) => `/publico/${encodeURIComponent(l.empresa)}/pedidos/${encodeURIComponent(l.token)}`

/** "Acompanhe seu pedido" (/pedido/:empresa/:token), sem login. */
export const pedidoPublicoApi = {
  obter: (l: LinkPublico) => http<PedidoAcompanhamento>(pedidoPublico(l), { autenticado: false }),
  /** Aprova as artes que aguardam o cliente (todas, ou só as escolhidas); devolve o pedido atualizado */
  aprovarArtes: (l: LinkPublico, nome: string, arteIds?: string[]) =>
    http<PedidoAcompanhamento>(`${pedidoPublico(l)}/artes/aprovar`, { method: 'POST', body: { nome, aceite: true, arteIds }, autenticado: false }),
  pedirAjusteArte: (l: LinkPublico, arteId: string, nome: string, comentario: string) =>
    http<PedidoAcompanhamento>(`${pedidoPublico(l)}/artes/${encodeURIComponent(arteId)}/ajuste`, { method: 'POST', body: { nome, comentario }, autenticado: false }),
}

export const artePublicaApi = {
  obter: (l: LinkPublico) => http<ArtePublica>(artePublica(l), { autenticado: false }),
  aprovar: (l: LinkPublico, nome: string) =>
    http<ArtePublica>(`${artePublica(l)}/aprovar`, { method: 'POST', body: { nome, aceite: true }, autenticado: false }),
  pedirAjuste: (l: LinkPublico, nome: string, comentario: string) =>
    http<ArtePublica>(`${artePublica(l)}/ajuste`, { method: 'POST', body: { nome, comentario }, autenticado: false }),
}
