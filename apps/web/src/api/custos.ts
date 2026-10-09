import type {
  AplicarReajusteInput,
  ComposicaoProdutoDetalhe,
  ComposicaoProdutoInput,
  InsumoDetalhe,
  InsumoInput,
  InsumoResumo,
  InsumosQuery,
  Paginado,
  Precificacao,
  PrecificacaoInput,
  ProdutoReajuste,
} from '@onprint/shared'
import { http, qs } from './http'

/** Insumos e materiais (Produtos → Insumos): produtos do tipo insumo com tela própria. */
export const insumosApi = {
  listar: (q: InsumosQuery) => http<Paginado<InsumoResumo>>(`/insumos${qs(q)}`),
  obter: (id: string) => http<InsumoDetalhe>(`/insumos/${id}`),
  criar: (dados: InsumoInput) => http<InsumoDetalhe>('/insumos', { method: 'POST', body: dados }),
  atualizar: (id: string, dados: InsumoInput) => http<InsumoDetalhe>(`/insumos/${id}`, { method: 'PUT', body: dados }),
}

/** Composição de custo e preço do produto (aba "Custo e preço"). */
export const composicaoApi = {
  obter: (produtoId: string) => http<ComposicaoProdutoDetalhe>(`/produtos/${produtoId}/composicao`),
  salvar: (produtoId: string, dados: ComposicaoProdutoInput) =>
    http<ComposicaoProdutoDetalhe>(`/produtos/${produtoId}/composicao`, { method: 'PUT', body: dados }),
}

/** Reajuste de preços em lote (o preço nunca muda sozinho). */
export const reajusteApi = {
  listar: (situacao: 'abaixo' | 'todos') => http<ProdutoReajuste[]>(`/produtos/reajuste${qs({ situacao })}`),
  aplicar: (dados: AplicarReajusteInput) => http<{ atualizados: number }>('/produtos/reajuste', { method: 'POST', body: dados }),
}

/** Configurações → Precificação (impostos, comissão, custos fixos e lucro padrão). */
export const precificacaoApi = {
  obter: () => http<Precificacao>('/empresa/precificacao'),
  salvar: (dados: PrecificacaoInput) => http<Precificacao>('/empresa/precificacao', { method: 'PUT', body: dados }),
}
