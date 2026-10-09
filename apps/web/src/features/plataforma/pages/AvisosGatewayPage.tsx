import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock, RotateCcw, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { formatarDataHora } from '@onprint/shared'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { plataformaApi } from '../api'
import { CabecalhoPlataforma, Secao } from '../components/Secao'

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
  const aba = (ativo: boolean) => cn('rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors', ativo ? 'bg-grafite text-white shadow-sm' : 'text-tinta hover:bg-white')

  return (
    <>
      <CabecalhoPlataforma
        sobretitulo="Integração"
        titulo="Avisos do Asaas"
        subtitulo="Cada aviso é guardado antes de ser aplicado; repetidos são ignorados. A conferência diária corrige o que ficar para trás."
        acoes={
          <div className="flex gap-1 rounded-xl bg-card p-1 shadow-suave" role="group" aria-label="Filtro">
            <button type="button" className={aba(soErro)} aria-pressed={soErro} onClick={() => setSoErro(true)}>
              Com erro
            </button>
            <button type="button" className={aba(!soErro)} aria-pressed={!soErro} onClick={() => setSoErro(false)}>
              Todos
            </button>
          </div>
        }
      />
      <Secao rotulo="Avisos recebidos">
        {consulta.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : consulta.isError ? (
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        ) : consulta.data.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-marca-escuro">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {soErro ? 'Nenhum aviso com erro.' : 'Nenhum aviso recebido ainda.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {consulta.data.map((e) => {
              const Icone = e.erro ? XCircle : e.processadoEm ? CheckCircle2 : Clock
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl p-3 text-sm ring-1 ring-border">
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', e.erro ? 'bg-coral/10 text-coral-escuro' : e.processadoEm ? 'bg-marca-suave text-marca-escuro' : 'bg-fundo text-tinta')}>
                    <Icone className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="break-all font-mono text-xs font-semibold text-tinta">{e.tipo}</p>
                    <p className={cn('text-sm', e.erro ? 'text-coral-escuro' : 'text-texto-secundario')}>{e.erro ?? (e.processadoEm ? 'Aplicado' : 'Pendente')}</p>
                  </div>
                  <div className="text-right text-xs text-texto-secundario">
                    <p>{formatarDataHora(e.recebidoEm)}</p>
                    <p className="break-all font-mono text-[11px]">{e.eventoId}</p>
                  </div>
                  {e.erro && !e.processadoEm && (
                    <Button size="sm" variant="outline" disabled={reprocessar.isPending} onClick={() => reprocessar.mutate(e.id)}>
                      <RotateCcw /> Reprocessar
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Secao>
    </>
  )
}
