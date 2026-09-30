import { useQuery } from '@tanstack/react-query'
import { estoqueApi } from '@/api/estoque'
import { usePermission } from '@/hooks/usePermission'

export function useLocaisEstoque() {
  return useQuery({ queryKey: ['estoque', 'locais'], queryFn: estoqueApi.locais, staleTime: 5 * 60 * 1000 })
}

/** Quantos produtos estão abaixo do mínimo (badge do menu). Atualiza a cada 5 min e por tempo real. */
export function useContagemAlertas() {
  const pode = usePermission('estoque')
  return useQuery({
    queryKey: ['estoque', 'alertas-contagem'],
    queryFn: estoqueApi.contagemAlertas,
    enabled: pode,
    refetchInterval: 5 * 60 * 1000,
    select: (r) => r.total,
  })
}
