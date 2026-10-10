import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProdutosVitrineQuery } from '@onprint/shared'
import { CHAVE_VITRINE_CONFIG, CHAVE_VITRINE_PRODUTOS, vitrineApi } from '@/api/vitrine'

export function useVitrineConfig(habilitado = true) {
  return useQuery({ queryKey: CHAVE_VITRINE_CONFIG, queryFn: vitrineApi.config, enabled: habilitado })
}

export function useProdutosVitrine(q: ProdutosVitrineQuery = {}) {
  return useQuery({ queryKey: [CHAVE_VITRINE_PRODUTOS, q], queryFn: () => vitrineApi.produtos(q) })
}

/** Um produto na vitrine (aba "Vitrine" do cadastro): vem da mesma lista da tela Vitrine → Produtos */
export function useProdutoVitrine(produtoId: string) {
  const consulta = useProdutosVitrine()
  return { ...consulta, produto: consulta.data?.find((p) => p.id === produtoId) }
}

/** Depois de mudar foto ou dados da vitrine: lista da vitrine, contagem da config e o cadastro (a capa vira a imagem do produto) */
export function useAtualizarVitrine() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [CHAVE_VITRINE_PRODUTOS] }),
      queryClient.invalidateQueries({ queryKey: CHAVE_VITRINE_CONFIG }),
      queryClient.invalidateQueries({ queryKey: ['produtos'] }),
    ])
}
