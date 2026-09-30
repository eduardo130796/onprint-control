import { useQuery } from '@tanstack/react-query'
import { templatesLeituraApi } from '@/api/comercial'
import { pedidosApi } from '@/api/producao'

export function usePedido(id: string) {
  return useQuery({ queryKey: ['pedidos', 'detalhe', id], queryFn: () => pedidosApi.obter(id) })
}

export function useTemplates() {
  return useQuery({ queryKey: ['templates', 'ativos'], queryFn: templatesLeituraApi.listar, staleTime: 5 * 60 * 1000 })
}
