import { keepPreviousData, useQuery } from '@tanstack/react-query'
export { useMutacao } from '@/hooks/useMutacao'
import type { ProdutosQuery } from '@onprint/shared'
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

export function useInsumosOpcoes() {
  return useQuery({
    queryKey: ['produtos', 'insumos-opcoes'],
    queryFn: async () => {
      const [insumos, revenda] = await Promise.all([
        produtosApi.listar({ ...opcoes, tipo: 'insumo', ativo: 'true' }),
        produtosApi.listar({ ...opcoes, tipo: 'revenda', ativo: 'true' }),
      ])
      return [...insumos.data, ...revenda.data]
    },
  })
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

