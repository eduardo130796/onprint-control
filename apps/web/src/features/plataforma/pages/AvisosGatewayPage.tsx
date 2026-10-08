import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { formatarData } from '@onprint/shared'
import { PageHeader } from '@/components/layout/PageHeader'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/form-controls'
import { Skeleton } from '@/components/ui/skeleton'
import { plataformaApi } from '../api'

/** Avisos (webhooks) recebidos do Asaas: o que foi aplicado e o que deu erro (com reprocessar). */
export function AvisosGatewayPage() {
  const queryClient = useQueryClient()
  const [soErro, setSoErro] = useState(true)
  const consulta = useQuery({ queryKey: ['plataforma', 'avisos', soErro], queryFn: () => plataformaApi.avisos(soErro) })
  const reprocessar = useMutation({
    mutationFn: plataformaApi.reprocessar,
    onSuccess: () => {
      toast.success('Aviso aplicado.')
      void queryClient.invalidateQueries({ queryKey: ['plataforma'] })
    },
    onError: (e) => toast.error((e as Error).message),
  })

  return (
    <>
      <PageHeader titulo="Avisos do Asaas" subtitulo="Cada aviso é guardado antes de ser aplicado; repetidos são ignorados. A conferência diária corrige o que ficar para trás." />
      <label className="mb-4 flex items-center gap-2 text-sm">
        <Checkbox checked={soErro} onChange={(e) => setSoErro(e.target.checked)} /> Só os que deram erro
      </label>
      <Card>
        {consulta.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : consulta.isError ? (
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        ) : consulta.data.length === 0 ? (
          <p className="p-6 text-sm text-texto-secundario">{soErro ? 'Nenhum aviso com erro.' : 'Nenhum aviso recebido ainda.'}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {consulta.data.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                <span className="w-36 text-texto-secundario">{formatarData(e.recebidoEm)}</span>
                <span className="w-56 font-mono text-xs">{e.tipo}</span>
                <span className="min-w-0 flex-1">{e.erro ? <span className="text-coral-escuro">{e.erro}</span> : e.processadoEm ? 'Aplicado' : 'Pendente'}</span>
                <span className="font-mono text-[11px] text-texto-secundario">{e.eventoId}</span>
                {e.erro && !e.processadoEm && (
                  <Button size="sm" variant="outline" disabled={reprocessar.isPending} onClick={() => reprocessar.mutate(e.id)}>
                    Reprocessar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
