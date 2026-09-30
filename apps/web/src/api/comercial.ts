import type {
  MensagemTemplate,
  OrcamentoDetalhe,
  Orcamento,
  OrcamentoPublico,
  OrcamentosQuery,
  Paginado,
  ProdutoCatalogo,
  Solicitacao,
  SolicitacoesQuery,
} from '@onprint/shared'
import { http, qs } from './http'

export const solicitacoesApi = {
  listar: (q: SolicitacoesQuery) => http<Paginado<Solicitacao>>(`/solicitacoes${qs(q)}`),
  obter: (id: string) => http<Solicitacao>(`/solicitacoes/${id}`),
  criar: (dados: unknown) => http<Solicitacao>('/solicitacoes', { method: 'POST', body: dados }),
  assumir: (id: string) => http<Solicitacao>(`/solicitacoes/${id}/assumir`, { method: 'POST' }),
  descartar: (id: string, motivo: string) => http<Solicitacao>(`/solicitacoes/${id}/descartar`, { method: 'POST', body: { motivo } }),
}

const acao = (id: string, nome: string, body?: unknown) =>
  http<OrcamentoDetalhe>(`/orcamentos/${id}/${nome}`, { method: 'POST', body })

export const orcamentosApi = {
  listar: (q: OrcamentosQuery) => http<Paginado<Orcamento>>(`/orcamentos${qs(q)}`),
  obter: (id: string) => http<OrcamentoDetalhe>(`/orcamentos/${id}`),
  criar: (dados: unknown) => http<OrcamentoDetalhe>('/orcamentos', { method: 'POST', body: dados }),
  atualizar: (id: string, dados: unknown) => http<OrcamentoDetalhe>(`/orcamentos/${id}`, { method: 'PUT', body: dados }),
  enviar: (id: string) => acao(id, 'enviar'),
  negociacao: (id: string) => acao(id, 'negociacao'),
  aprovar: (id: string, nome: string) => acao(id, 'aprovar', { nome }),
  recusar: (id: string, motivo: string) => acao(id, 'recusar', { motivo }),
  reabrir: (id: string) => acao(id, 'reabrir'),
  duplicar: (id: string) => acao(id, 'duplicar'),
  converter: (id: string, dados: unknown) => acao(id, 'converter', dados),
  catalogo: (busca: string) => http<ProdutoCatalogo[]>(`/orcamentos/catalogo${qs({ busca })}`),
  produto: (id: string) => http<ProdutoCatalogo>(`/orcamentos/catalogo/${id}`),
}

export const templatesLeituraApi = {
  listar: () => http<MensagemTemplate[]>('/templates?ativos=true'),
}

/** Rotas públicas do link de aprovação (sem login). */
export const publicoApi = {
  obter: (token: string) => http<OrcamentoPublico>(`/publico/orcamentos/${token}`, { autenticado: false }),
  aprovar: (token: string, nome: string) =>
    http<OrcamentoPublico>(`/publico/orcamentos/${token}/aprovar`, { method: 'POST', body: { nome, aceite: true }, autenticado: false }),
  recusar: (token: string, motivo: string) =>
    http<OrcamentoPublico>(`/publico/orcamentos/${token}/recusar`, { method: 'POST', body: { motivo }, autenticado: false }),
}
