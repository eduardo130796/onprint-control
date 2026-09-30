import type {
  Acabamento,
  CadastroQuery,
  Categoria,
  Maquina,
  Paginado,
  Processo,
  Produto,
  ProdutoDetalhe,
  ProdutosQuery,
  ResultadoPreco,
  UnidadeMedida,
} from '@onprint/shared'
import { http, qs, upload } from './http'

/** Cliente REST padrão dos cadastros simples (mesmas rotas do core/crud-rotas da API). */
export function recursoCrud<T>(caminho: string) {
  return {
    listar: (q: Record<string, unknown>) => http<Paginado<T>>(`${caminho}${qs(q)}`),
    obter: (id: string) => http<T>(`${caminho}/${id}`),
    criar: (dados: unknown) => http<T>(caminho, { method: 'POST', body: dados }),
    atualizar: (id: string, dados: unknown) => http<T>(`${caminho}/${id}`, { method: 'PUT', body: dados }),
    desativar: (id: string) => http<T>(`${caminho}/${id}`, { method: 'DELETE' }),
    reativar: (id: string) => http<T>(`${caminho}/${id}/reativar`, { method: 'POST' }),
  }
}

export const acabamentosApi = recursoCrud<Acabamento>('/acabamentos')
export const maquinasApi = recursoCrud<Maquina>('/maquinas')
export const processosApi = recursoCrud<Processo>('/processos')

export const categoriasApi = {
  listar: (ativo: 'true' | 'false' | 'todos' = 'todos') => http<Categoria[]>(`/categorias${qs({ ativo })}`),
  criar: (dados: unknown) => http<Categoria>('/categorias', { method: 'POST', body: dados }),
  atualizar: (id: string, dados: unknown) => http<Categoria>(`/categorias/${id}`, { method: 'PUT', body: dados }),
}

export const unidadesApi = { listar: () => http<UnidadeMedida[]>('/unidades-medida') }

export type ResultadoSimulacao = Omit<ResultadoPreco, 'custoTotal' | 'margemPercentual'> & {
  custoTotal: string | null
  margemPercentual: string | null
  acabamentosAplicados: string[]
}

export const produtosApi = {
  listar: (q: ProdutosQuery) => http<Paginado<Produto>>(`/produtos${qs(q)}`),
  obter: (id: string) => http<ProdutoDetalhe>(`/produtos/${id}`),
  criar: (dados: unknown) => http<Produto>('/produtos', { method: 'POST', body: dados }),
  atualizar: (id: string, dados: unknown) => http<Produto>(`/produtos/${id}`, { method: 'PUT', body: dados }),
  desativar: (id: string) => http<Produto>(`/produtos/${id}`, { method: 'DELETE' }),
  reativar: (id: string) => http<Produto>(`/produtos/${id}/reativar`, { method: 'POST' }),
  enviarImagem: (id: string, arquivo: File, aoProgredir?: (pct: number) => void) =>
    upload<Produto>(`/produtos/${id}/imagem`, arquivo, aoProgredir),
  salvarAcabamentos: (id: string, itens: unknown[]) =>
    http<ProdutoDetalhe>(`/produtos/${id}/acabamentos`, { method: 'PUT', body: { itens } }),
  salvarInsumos: (id: string, itens: unknown[]) => http<ProdutoDetalhe>(`/produtos/${id}/insumos`, { method: 'PUT', body: { itens } }),
  salvarProcessos: (id: string, itens: unknown[]) =>
    http<ProdutoDetalhe>(`/produtos/${id}/processos`, { method: 'PUT', body: { itens } }),
  simular: (id: string, dados: unknown, signal?: AbortSignal) =>
    http<ResultadoSimulacao>(`/produtos/${id}/simular`, { method: 'POST', body: dados, signal }),
}

export type { CadastroQuery }
