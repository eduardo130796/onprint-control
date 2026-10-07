import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Clock, Cpu, Factory } from 'lucide-react'
import { formatarDataSimples, type OrdemProducao } from '@onprint/shared'
import { pcpApi } from '@/api/producao'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { SeloPrioridade } from '@/components/shared/Selos'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermission } from '@/hooks/usePermission'
import { cn } from '@/lib/utils'
import { GanttSimples } from '../components/GanttSimples'
import { ReprogramarOpDialog } from '../components/ReprogramarOpDialog'

const horas = (h: number) => `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`

function Indicador({ icone: Icone, titulo, valor, alerta }: { icone: typeof Clock; titulo: string; valor: string; alerta?: boolean }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', alerta ? 'bg-coral/10 text-coral-escuro' : 'bg-accent text-grafite')}>
        <Icone className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-texto-secundario">{titulo}</p>
        <p className={cn('text-xl font-semibold', alerta ? 'text-coral-escuro' : 'text-grafite')}>{valor}</p>
      </div>
    </Card>
  )
}

/** PCP / Cockpit: carga por máquina, capacidade × demanda da semana, gargalos, atrasos e Gantt. */
export function PcpPage() {
  const consulta = useQuery({ queryKey: ['pcp'], queryFn: pcpApi.resumo })
  const podeReprogramar = usePermission('producao', 'editar')
  const [selecionada, setSelecionada] = useState<OrdemProducao | null>(null)

  if (consulta.isPending) return <Skeleton className="h-96 w-full" />
  if (consulta.isError) return <Card><EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} /></Card>
  const r = consulta.data
  const totalHoras = r.maquinas.reduce((s, m) => s + m.horasEstimadas, 0) + r.semMaquina.horasEstimadas

  return (
    <>
      <PageHeader titulo="PCP / Cockpit" subtitulo={`Semana de ${formatarDataSimples(r.semana.inicio)} a ${formatarDataSimples(r.semana.fim)} · capacidade de 8 h por dia útil por máquina`} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador icone={Factory} titulo="OPs em aberto" valor={String(r.ops.length)} />
        <Indicador icone={Clock} titulo="Carga total estimada" valor={horas(totalHoras)} />
        <Indicador icone={Cpu} titulo="Gargalos" valor={r.gargalos.length ? r.gargalos.join(', ') : 'Nenhum'} alerta={r.gargalos.length > 0} />
        <Indicador icone={AlertTriangle} titulo="OPs atrasadas" valor={String(r.atrasadas.length)} alerta={r.atrasadas.length > 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Capacidade × demanda (semana)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {r.maquinas.map((m) => {
              const pct = Math.min(100, m.ocupacao)
              return (
                <div key={m.maquina.id}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{m.maquina.nome}</span>
                    <span className={cn(m.ocupacao > 100 ? 'font-semibold text-coral-escuro' : 'text-texto-secundario')}>
                      {m.capacidadeSemana ? `${m.ocupacao.toLocaleString('pt-BR')}%` : m.maquina.status === 'ativa' ? '—' : 'parada'}
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-fundo">
                    <div className={cn('h-full rounded-full', m.ocupacao > 100 ? 'bg-coral' : m.ocupacao > 80 ? 'bg-ambar' : 'bg-marca')} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-texto-secundario">
                    {horas(m.horasSemana)} de {horas(m.capacidadeSemana)} · {m.opsNaFila} OP(s) na fila ({horas(m.horasEstimadas)} no total)
                  </p>
                </div>
              )
            })}
            {r.semMaquina.opsNaFila > 0 && (
              <p className="rounded-lg bg-ambar/10 p-2 text-xs">
                {r.semMaquina.opsNaFila} OP(s) sem máquina definida ({horas(r.semMaquina.horasEstimadas)}).
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Programação (14 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            {r.ops.length === 0 ? (
              <EmptyState icone={Factory} titulo="Nenhuma OP em aberto" className="py-8" />
            ) : (
              <GanttSimples ops={r.ops} inicio={r.semana.inicio} onSelecionar={(op) => (podeReprogramar ? setSelecionada(op) : undefined)} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Atrasadas</CardTitle>
        </CardHeader>
        <CardContent>
          {r.atrasadas.length === 0 ? (
            <p className="text-sm text-texto-secundario">Nenhuma OP atrasada.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {r.atrasadas.map((op) => (
                <li key={op.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <Link to={`/producao/ordens/${op.id}`} className="font-mono text-xs font-semibold text-grafite hover:underline">
                    {op.numero}
                  </Link>
                  <span className="min-w-0 flex-1 truncate">
                    {op.pedido.cliente.nome} · {op.item.descricao}
                  </span>
                  <StatusBadge entidade="producao" codigo={op.etapaAtual} />
                  <SeloPrioridade prioridade={op.prioridade} />
                  <span className="text-coral-escuro">prazo {formatarDataSimples(op.dataFimPrevista ?? op.pedido.dataPrevistaEntrega)}</span>
                  {podeReprogramar && (
                    <Button size="sm" variant="outline" onClick={() => setSelecionada(op)}>
                      Reprogramar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {selecionada && <ReprogramarOpDialog op={selecionada} onFechar={() => setSelecionada(null)} />}
    </>
  )
}
