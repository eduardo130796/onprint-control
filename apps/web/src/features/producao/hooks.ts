import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { EtapaProducao, OrdemProducao } from '@onprint/shared'
import { usuariosOpcoesApi } from '@/api/cadastros'
import { ErroApi } from '@/api/http'
import { opsApi } from '@/api/producao'
import { usePermission } from '@/hooks/usePermission'

export function useMaquinasOpcoes() {
  return useQuery({
    queryKey: ['maquinas', 'opcoes'],
    queryFn: opsApi.maquinas,
    staleTime: 5 * 60 * 1000,
  })
}

export function useUsuariosOpcoes() {
  return useQuery({ queryKey: ['usuarios', 'opcoes'], queryFn: usuariosOpcoesApi.opcoes, staleTime: 5 * 60 * 1000 })
}

interface PedidoOverride {
  op: OrdemProducao
  etapa: EtapaProducao
  ordemIds: string[]
  resolver: (ok: boolean) => void
}

/**
 * Movimento de OP com a regra da arte: se a API recusar por ARTE_NAO_APROVADA e o usuário
 * puder liberar (producao:aprovar), abre o diálogo de override; senão mostra o motivo.
 */
export function useMoverOp() {
  const queryClient = useQueryClient()
  const podeLiberar = usePermission('producao', 'aprovar')
  const [override, setOverride] = useState<PedidoOverride | null>(null)

  const atualizar = useCallback(() => {
    for (const chave of ['ops', 'pedidos', 'pcp']) void queryClient.invalidateQueries({ queryKey: [chave] })
  }, [queryClient])

  const mover = useCallback(
    async (op: OrdemProducao, etapa: EtapaProducao, ordemIds: string[]) => {
      try {
        await opsApi.mover(op.id, { etapa, ordemIds })
        atualizar()
      } catch (e) {
        const semArte = e instanceof ErroApi && (e.details as { motivo?: string } | undefined)?.motivo === 'ARTE_NAO_APROVADA'
        if (!semArte || !podeLiberar) {
          toast.error((e as Error).message)
          throw e
        }
        const liberado = await new Promise<boolean>((resolver) => setOverride({ op, etapa, ordemIds, resolver }))
        if (!liberado) throw e
      }
    },
    [atualizar, podeLiberar],
  )

  const confirmarOverride = useCallback(
    async (motivo: string) => {
      if (!override) return
      await opsApi.mover(override.op.id, { etapa: override.etapa, ordemIds: override.ordemIds, override: true, motivo })
      toast.success(`${override.op.numero} liberada sem arte aprovada.`)
      override.resolver(true)
      setOverride(null)
      atualizar()
    },
    [override, atualizar],
  )

  const cancelarOverride = useCallback(() => {
    override?.resolver(false)
    setOverride(null)
  }, [override])

  return { mover, override: override?.op ?? null, confirmarOverride, cancelarOverride }
}
