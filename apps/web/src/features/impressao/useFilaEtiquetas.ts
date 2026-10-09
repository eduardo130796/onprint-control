import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { filaEtiquetasApi } from '@/api/producao'
import { usePermission } from '@/hooks/usePermission'

// Fila de etiquetas (no servidor: vale em qualquer aparelho). Atualiza sozinha quando uma OP muda (tempo real)
// e, por garantia, a cada minuto.
export const CHAVE_FILA_ETIQUETAS = ['etiquetas', 'fila'] as const

/** Fila pendente; só consulta para quem vê a produção (mesma permissão da API). */
export function useFilaEtiquetas() {
  const pode = usePermission('producao')
  const consulta = useQuery({ queryKey: CHAVE_FILA_ETIQUETAS, queryFn: filaEtiquetasApi.listar, enabled: pode, refetchInterval: 60_000 })
  return { ...consulta, pode }
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** Ações da fila com aviso (toast). Devolvem true quando deram certo. */
export function useAcoesFilaEtiquetas() {
  const queryClient = useQueryClient()
  const atualizar = useCallback(() => queryClient.invalidateQueries({ queryKey: CHAVE_FILA_ETIQUETAS }), [queryClient])

  const adicionar = useCallback(
    async (dados: { opIds?: string[]; pedidoIds?: string[] }) => {
      try {
        const r = await filaEtiquetasApi.adicionar(dados)
        if (r.adicionadas === 0) toast.info(r.jaNaFila === 1 ? 'Esta etiqueta já estava na fila.' : 'Essas etiquetas já estavam na fila.')
        else toast.success(`${plural(r.adicionadas, 'etiqueta adicionada', 'etiquetas adicionadas')} à fila${r.jaNaFila ? ` (${r.jaNaFila} já estava${r.jaNaFila === 1 ? '' : 'm'} lá)` : ''}.`)
        await atualizar()
        return true
      } catch (e) {
        toast.error((e as Error).message)
        return false
      }
    },
    [atualizar],
  )

  const remover = useCallback(
    async (id: string) => {
      try {
        await filaEtiquetasApi.remover(id)
      } catch (e) {
        toast.error((e as Error).message)
      }
      await atualizar()
    },
    [atualizar],
  )

  /** Tira da fila as impressas (o painel da fila mostra o "Desfazer"). Devolve quantas saíram. */
  const marcarImpressas = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return 0
      try {
        const { marcadas } = await filaEtiquetasApi.marcarImpressas(ids)
        await atualizar()
        return marcadas
      } catch (e) {
        toast.error((e as Error).message)
        return 0
      }
    },
    [atualizar],
  )

  /** Desfaz o "marcar como impressas": as etiquetas voltam para a fila. */
  const voltar = useCallback(
    async (ids: string[]) => {
      try {
        await filaEtiquetasApi.voltar(ids)
      } catch (e) {
        toast.error((e as Error).message)
      }
      await atualizar()
    },
    [atualizar],
  )

  return { adicionar, remover, marcarImpressas, voltar }
}
