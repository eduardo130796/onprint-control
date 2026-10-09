import { keepPreviousData, useQuery } from '@tanstack/react-query'
export { useMutacao } from '@/hooks/useMutacao'
import type { InsumosQuery, ProdutosQuery } from '@onprint/shared'
import { composicaoApi, insumosApi, precificacaoApi, reajusteApi } from '@/api/custos'
import { usePermission } from '@/hooks/usePermission'
import { acabamentosApi, categoriasApi, maquinasApi, processosApi, produtosApi, unidadesApi } from '@/api/produtos'

/** Lista completa (até 100) de um cadastro ativo, para selects. */
const opcoes = { page: 1, pageSize: 100, ativo: 'true' }

export function useCategorias(ativo: 'true' | 'false' | 'todos' = 'todos') {
  return useQuery({ queryKey: ['categorias', ativo], queryFn: () => categoriasApi.listar(ativo) })
}

export function useUnidades() {
  return useQuery({ queryKey: ['unidades-medida'], queryFn: unidadesApi.listar, staleTime: 30 * 60 * 1000 })
}

export function useProdutos(q: ProdutosQuery) {
  return useQuery({ queryKey: ['produtos', 'lista', q], queryFn: () => produtosApi.listar(q), placeholderData: keepPreviousData })
}

export function useProduto(id: string | undefined) {
  return useQuery({ queryKey: ['produtos', 'detalhe', id], queryFn: () => produtosApi.obter(id as string), enabled: Boolean(id) })
}

export function useAcabamentosOpcoes() {
  return useQuery({ queryKey: ['acabamentos', 'opcoes'], queryFn: () => acabamentosApi.listar(opcoes).then((r) => r.data) })
}

export function useMaquinasOpcoes() {
  return useQuery({ queryKey: ['maquinas', 'opcoes'], queryFn: () => maquinasApi.listar(opcoes).then((r) => r.data) })
}

export function useProcessosOpcoes() {
  return useQuery({ queryKey: ['processos', 'opcoes'], queryFn: () => processosApi.listar(opcoes).then((r) => r.data) })
}


// ─── Custos e preço ─────────────────────────────────────────────────────────

export function useInsumos(q: InsumosQuery) {
  return useQuery({ queryKey: ['insumos', 'lista', q], queryFn: () => insumosApi.listar(q), placeholderData: keepPreviousData })
}

export function useInsumo(id: string | undefined) {
  return useQuery({ queryKey: ['insumos', 'detalhe', id], queryFn: () => insumosApi.obter(id as string), enabled: Boolean(id) })
}

/** Fica sob ['produtos'] para ser invalidada junto com o produto. */
export function useComposicao(produtoId: string | undefined, habilitado = true) {
  return useQuery({
    queryKey: ['produtos', 'composicao', produtoId],
    queryFn: () => composicaoApi.obter(produtoId as string),
    enabled: Boolean(produtoId) && habilitado,
  })
}

export function useReajuste(situacao: 'abaixo' | 'todos') {
  return useQuery({ queryKey: ['produtos', 'reajuste', situacao], queryFn: () => reajusteApi.listar(situacao), placeholderData: keepPreviousData })
}

/** Quantos produtos estão abaixo do lucro mínimo (contador do menu, só para quem edita produtos). */
export function useContagemReajuste() {
  const pode = usePermission('produtos', 'editar')
  return useQuery({
    queryKey: ['produtos', 'reajuste', 'abaixo'],
    queryFn: () => reajusteApi.listar('abaixo'),
    enabled: pode,
    staleTime: 5 * 60 * 1000,
    select: (r) => r.length,
  })
}

export function usePrecificacao() {
  return useQuery({ queryKey: ['precificacao'], queryFn: precificacaoApi.obter, staleTime: 5 * 60 * 1000 })
}
