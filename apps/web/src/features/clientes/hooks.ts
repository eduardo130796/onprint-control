import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClientesQuery } from '@onprint/shared'
import { clientesApi, usuariosOpcoesApi } from '@/api/cadastros'

export const chavesClientes = {
  todos: ['clientes'] as const,
  lista: (q: ClientesQuery) => ['clientes', 'lista', q] as const,
  detalhe: (id: string) => ['clientes', 'detalhe', id] as const,
}

export function useClientes(q: ClientesQuery) {
  return useQuery({ queryKey: chavesClientes.lista(q), queryFn: () => clientesApi.listar(q), placeholderData: keepPreviousData })
}

export function useCliente(id: string | undefined) {
  return useQuery({
    queryKey: chavesClientes.detalhe(id ?? ''),
    queryFn: () => clientesApi.obter(id as string),
    enabled: Boolean(id),
  })
}

/** Total de pré-cadastros ativos (atalho de filtro na lista). */
export function useTotalPreCadastros() {
  return useQuery({
    queryKey: ['clientes', 'total-pre-cadastro'],
    queryFn: () => clientesApi.listar({ situacao: 'pre_cadastro', pageSize: 1 }),
    select: (r) => r.meta.total,
  })
}

export function useVendedores() {
  return useQuery({ queryKey: ['usuarios', 'opcoes'], queryFn: usuariosOpcoesApi.opcoes, staleTime: 5 * 60 * 1000 })
}

/** Mutação que invalida tudo de clientes ao terminar. */
export function useMutacaoClientes<A, R>(fn: (args: A) => Promise<R>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chavesClientes.todos }),
  })
}
