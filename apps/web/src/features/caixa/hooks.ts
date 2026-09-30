import { useQuery } from '@tanstack/react-query'
import { caixaApi } from '@/api/financeiro'

/** Caixa aberto do usuário (null se fechado). */
export function useCaixaAtual() {
  return useQuery({ queryKey: ['caixa', 'atual'], queryFn: caixaApi.atual })
}

export function useFormasCaixa() {
  return useQuery({ queryKey: ['caixa', 'formas'], queryFn: caixaApi.formas, staleTime: 5 * 60 * 1000 })
}
