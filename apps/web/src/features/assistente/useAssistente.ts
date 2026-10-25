import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { FuncaoAssistente } from '@onprint/shared'
import { CHAVE_ASSISTENTE, assistenteApi } from '@/api/assistente'

/** Controles e uso do Assistente GrafyGo na empresa (o mesmo para todas as telas, em cache por um minuto) */
export function useAssistente() {
  return useQuery({ queryKey: CHAVE_ASSISTENTE, queryFn: assistenteApi.obter, staleTime: 60_000 })
}

/** A ajuda funciona agora (central ligada e a empresa deixando): as telas só mostram o botão nesse caso */
export function useAjudaLiberada(funcao: FuncaoAssistente): boolean {
  const consulta = useAssistente()
  return Boolean(consulta.data?.liberado[funcao])
}

/** Depois de usar uma ajuda: o uso do mês mudou */
export function useAtualizarUsoAssistente() {
  const queryClient = useQueryClient()
  return () => void queryClient.invalidateQueries({ queryKey: CHAVE_ASSISTENTE })
}
