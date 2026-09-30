import type {
  EntradaEstoque,
  EntradaEstoqueDetalhe,
  EntradasEstoqueQuery,
  EstoqueDoProduto,
  LocalEstoque,
  MovimentacaoEstoque,
  MovimentacoesQuery,
  OpcaoSelect,
  Paginado,
  PosicaoEstoque,
  PosicaoEstoqueQuery,
} from '@onprint/shared'
import { http, qs } from './http'

/** Estoque (Fase 5): posição, extrato, entradas, lançamentos manuais e locais. */
export const estoqueApi = {
  posicao: (q: PosicaoEstoqueQuery) => http<Paginado<PosicaoEstoque>>(`/estoque/posicao${qs(q)}`),
  contagemAlertas: () => http<{ total: number }>('/estoque/alertas/contagem'),
  doProduto: (produtoId: string) => http<EstoqueDoProduto>(`/estoque/produtos/${produtoId}`),
  movimentacoes: (q: MovimentacoesQuery) => http<Paginado<MovimentacaoEstoque>>(`/estoque/movimentacoes${qs(q)}`),
  lancar: (dados: unknown) => http<MovimentacaoEstoque[]>('/estoque/movimentacoes', { method: 'POST', body: dados }),
  entradas: (q: EntradasEstoqueQuery) => http<Paginado<EntradaEstoque>>(`/estoque/entradas${qs(q)}`),
  entrada: (id: string) => http<EntradaEstoqueDetalhe>(`/estoque/entradas/${id}`),
  registrarEntrada: (dados: unknown) => http<EntradaEstoqueDetalhe>('/estoque/entradas', { method: 'POST', body: dados }),
  fornecedores: (busca: string) => http<OpcaoSelect[]>(`/estoque/fornecedores${qs({ busca })}`),
  locais: () => http<LocalEstoque[]>('/estoque/locais'),
  salvarLocal: (dados: unknown, id?: string) =>
    id ? http<LocalEstoque>(`/estoque/locais/${id}`, { method: 'PUT', body: dados }) : http<LocalEstoque>('/estoque/locais', { method: 'POST', body: dados }),
}
