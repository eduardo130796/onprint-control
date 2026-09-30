import { useQuery } from '@tanstack/react-query'
import { arquivosApi } from '@/api/cadastros'
import { empresaApi } from '@/api/configuracoes'

export const CHAVE_EMPRESA = ['empresa'] as const

export function useEmpresa() {
  return useQuery({ queryKey: CHAVE_EMPRESA, queryFn: empresaApi.obter, staleTime: 5 * 60 * 1000 })
}

/** URL temporária (assinada, 10 min) para exibir um arquivo em <img>. */
export function useUrlArquivo(id: string | null | undefined) {
  return useQuery({
    queryKey: ['arquivo-url', id],
    queryFn: () => arquivosApi.urlTemporaria(id as string),
    enabled: Boolean(id),
    staleTime: 8 * 60 * 1000,
    select: (r) => r.url,
  })
}
