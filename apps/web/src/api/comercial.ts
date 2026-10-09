import type {
  AnaliseLucro,
  AnaliseOrcamento,
  MensagemTemplate,
  OrcamentoDetalhe,
  OrcamentoItem,
  OrcamentoItemInput,
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

/** Fase 3: semáforo do lucro por item e do total (os números só vêm para quem vê custos). */
export type OrcamentoComAnalise = Omit<OrcamentoDetalhe, 'itens'> & { itens: (OrcamentoItem & { analise?: AnaliseLucro })[]; analise?: AnaliseLucro }

const acao = (id: string, nome: string, body?: unknown) =>
  http<OrcamentoComAnalise>(`/orcamentos/${id}/${nome}`, { method: 'POST', body })

export const orcamentosApi = {
  listar: (q: OrcamentosQuery) => http<Paginado<Orcamento>>(`/orcamentos${qs(q)}`),
  obter: (id: string) => http<OrcamentoComAnalise>(`/orcamentos/${id}`),
  criar: (dados: unknown) => http<OrcamentoComAnalise>('/orcamentos', { method: 'POST', body: dados }),
  atualizar: (id: string, dados: unknown) => http<OrcamentoComAnalise>(`/orcamentos/${id}`, { method: 'PUT', body: dados }),
  /** Semáforo ao vivo do editor (mesmos itens do orçamento + desconto/acréscimo do cabeçalho; sem gravar) */
  analisar: (dados: { itens: OrcamentoItemInput[]; desconto?: string; acrescimo?: string }, signal?: AbortSignal) =>
    http<AnaliseOrcamento>('/orcamentos/analisar', { method: 'POST', body: dados, signal }),
  enviar: (id: string) => acao(id, 'enviar'),
  negociacao: (id: string) => acao(id, 'negociacao'),
  aprovar: (id: string, nome: string) => acao(id, 'aprovar', { nome }),
  recusar: (id: string, motivo: string) => acao(id, 'recusar', { motivo }),
  reabrir: (id: string) => acao(id, 'reabrir'),
  statusPersonalizado: (id: string, statusPersonalizadoId: string | null) => acao(id, 'status-personalizado', { statusPersonalizadoId }),
  duplicar: (id: string) => acao(id, 'duplicar'),
  converter: (id: string, dados: unknown) => acao(id, 'converter', dados),
  catalogo: (busca: string) => http<ProdutoCatalogo[]>(`/orcamentos/catalogo${qs({ busca })}`),
  produto: (id: string) => http<ProdutoCatalogo>(`/orcamentos/catalogo/${id}`),
}

export const templatesLeituraApi = {
  listar: () => http<MensagemTemplate[]>('/templates?ativos=true'),
}

/** Rotas públicas do link de aprovação (sem login). */
export interface LinkPublico {
  /** Slug da empresa (o link público diz de qual empresa é o documento) */
  empresa: string
  token: string
}

const orcamentoPublico = (l: LinkPublico) => `/publico/${encodeURIComponent(l.empresa)}/orcamentos/${encodeURIComponent(l.token)}`

export const publicoApi = {
  obter: (l: LinkPublico) => http<OrcamentoPublico>(orcamentoPublico(l), { autenticado: false }),
  aprovar: (l: LinkPublico, nome: string) =>
    http<OrcamentoPublico>(`${orcamentoPublico(l)}/aprovar`, { method: 'POST', body: { nome, aceite: true }, autenticado: false }),
  recusar: (l: LinkPublico, motivo: string) =>
    http<OrcamentoPublico>(`${orcamentoPublico(l)}/recusar`, { method: 'POST', body: { motivo }, autenticado: false }),
}
