import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { StatusConfig } from '@onprint/shared'
import { statusApi } from '@/api/configuracoes'
import { ordenarStatus } from '@/lib/colunasStatus'

export const CHAVE_STATUS = ['status-config'] as const

/** Todos os status configurados (cache longo; invalidado ao editar em Configurações → Status). */
export function useStatusConfig() {
  const query = useQuery({ queryKey: CHAVE_STATUS, queryFn: statusApi.listar, staleTime: 10 * 60 * 1000 })
  const mapa = useMemo(() => {
    const m = new Map<string, StatusConfig>()
    for (const s of query.data ?? []) m.set(`${s.entidade}:${s.codigo}`, s)
    return m
  }, [query.data])
  return { ...query, mapa }
}

/** Status de uma entidade (do sistema e próprios, inclusive ocultos) na ordem do quadro: colunas dos kanbans. */
export function useStatusDaEntidade(entidade: string) {
  const { data } = useStatusConfig()
  return useMemo(() => ordenarStatus((data ?? []).filter((s) => s.entidade === entidade)), [data, entidade])
}
