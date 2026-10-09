import type { Dashboard, LucratividadeQuery, Notificacao, Relatorio, RelatorioLucratividade, RelatorioQuery, ResultadoBusca, TipoRelatorio } from '@onprint/shared'
import { http, qs } from './http'

/** Dashboard, relatórios, busca global e notificações (Fase 7). */
export const dashboardApi = { obter: () => http<Dashboard>('/dashboard') }

export const relatoriosApi = {
  obter: (tipo: TipoRelatorio, q: RelatorioQuery) => http<Relatorio>(`/relatorios/${tipo}${qs(q)}`),
  /** Lucro por pedido ou por produto (relatorios:visualizar + ver custos) */
  lucratividade: (q: LucratividadeQuery) => http<RelatorioLucratividade>(`/relatorios/lucratividade${qs(q)}`),
}

export const buscaApi = { buscar: (q: string) => http<ResultadoBusca>(`/busca${qs({ q })}`) }

export const notificacoesApi = {
  listar: (q: { page?: number; pageSize?: number; naoLidas?: 'true' }) =>
    http<{ data: Notificacao[]; meta: { page: number; pageSize: number; total: number }; naoLidas: number }>(`/notificacoes${qs(q)}`),
  contagem: () => http<{ naoLidas: number }>('/notificacoes/contagem'),
  marcarLida: (id: string) => http<{ atualizadas: number }>(`/notificacoes/${id}/lida`, { method: 'POST' }),
  marcarTodas: () => http<{ atualizadas: number }>('/notificacoes/lidas', { method: 'POST', body: {} }),
}
