import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { STATUS_PADRAO, type StatusConfig } from '@onprint/shared'
import { statusApi } from '@/api/configuracoes'
import { useAuth } from '@/hooks/useAuth'
import { ordenarStatus } from '@/lib/colunasStatus'

export const CHAVE_STATUS = ['status-config'] as const

/** Todos os status configurados (cache longo; invalidado ao editar em Configurações → Status). */
export function useStatusConfig() {
  const { usuario } = useAuth()
  // Com a assinatura bloqueada a API recusa: nem tenta
  const query = useQuery({ queryKey: CHAVE_STATUS, queryFn: statusApi.listar, staleTime: 10 * 60 * 1000, enabled: usuario?.assinatura?.nivel !== 'bloqueado' })
  const mapa = useMemo(() => {
    // Os de fábrica valem enquanto os da empresa carregam (ou se falharem): nunca o código cru ("vencido") em cinza
    const m = new Map<string, Pick<StatusConfig, 'rotulo' | 'cor'>>()
    for (const [entidade, lista] of Object.entries(STATUS_PADRAO)) for (const s of lista) m.set(`${entidade}:${s.codigo}`, s)
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
