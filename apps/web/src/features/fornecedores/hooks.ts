import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FornecedoresQuery } from '@onprint/shared'
import { fornecedoresApi } from '@/api/cadastros'

const TODOS = ['fornecedores'] as const

export function useFornecedores(q: FornecedoresQuery) {
  return useQuery({ queryKey: ['fornecedores', 'lista', q], queryFn: () => fornecedoresApi.listar(q), placeholderData: keepPreviousData })
}

export function useFornecedor(id: string | undefined) {
  return useQuery({
    queryKey: ['fornecedores', 'detalhe', id],
    queryFn: () => fornecedoresApi.obter(id as string),
    enabled: Boolean(id),
  })
}

export function useMutacaoFornecedores<A, R>(fn: (args: A) => Promise<R>) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: TODOS }) })
}
