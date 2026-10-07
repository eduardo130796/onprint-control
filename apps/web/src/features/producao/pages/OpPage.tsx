import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CalendarClock, ImageOff, Printer } from 'lucide-react'
import { ETAPAS_PRODUCAO, formatarDataHora, formatarDataSimples, type EtapaProducao } from '@onprint/shared'
import { opsApi } from '@/api/producao'
import { PageHeader } from '@/components/layout/PageHeader'
import { Can } from '@/components/shared/Can'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { SeloAtraso, SeloPrioridade } from '@/components/shared/Selos'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/form-controls'
import { Skeleton } from '@/components/ui/skeleton'
import { useStatusConfig } from '@/hooks/useStatusConfig'
import { Apontamentos } from '../components/Apontamentos'
import { HistoricoEtapas } from '../components/HistoricoEtapas'
import { InsumosBaixados } from '../components/InsumosBaixados'
import { OverrideDialog } from '../components/OverrideDialog'
import { ReprogramarOpDialog } from '../components/ReprogramarOpDialog'
import { useMoverOp } from '../hooks'

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-texto-secundario">{rotulo}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

const num = (v: string | null) => (v ? Number(v).toLocaleString('pt-BR') : '—')

/** Detalhe da OP (/producao/ordens/:id): dados, mudança de etapa, histórico e apontamentos. */
export function OpPage() {
  const { id = '' } = useParams()
  const consulta = useQuery({ queryKey: ['ops', 'detalhe', id], queryFn: () => opsApi.obter(id) })
  const { mapa } = useStatusConfig()
  const [reprogramando, setReprogramando] = useState(false)
  const { mover, override, confirmarOverride, cancelarOverride } = useMoverOp()

  if (consulta.isPending) return <Skeleton className="h-96 w-full" />
  if (consulta.isError) return <Card><EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} /></Card>
  const op = consulta.data

  return (
    <>
      <PageHeader
        titulo={op.numero}
        subtitulo={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge entidade="producao" codigo={op.etapaAtual} />
            {op.atrasada && <SeloAtraso />}
            <SeloPrioridade prioridade={op.prioridade} />
            <Link to={`/pedidos/${op.pedidoId}`} className="text-marca-escuro hover:underline">
              {op.pedido.numero} · {op.pedido.cliente.nome}
            </Link>
          </span>
        }
        acoes={
          <>
            <Button asChild variant="outline">
              <Link to="/producao">
                <ArrowLeft /> Kanban
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href={`/producao/ordens/${op.id}/ficha`} target="_blank" rel="noreferrer">
                <Printer /> Ficha da OP
              </a>
            </Button>
            <Can modulo="producao" acao="editar">
              <Button variant="secondary" onClick={() => setReprogramando(true)}>
                <CalendarClock /> Reprogramar
              </Button>
            </Can>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{op.item.descricao}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <dl className="text-sm">
              <Linha rotulo="Quantidade">{num(op.quantidade)}</Linha>
              {op.largura && <Linha rotulo="Medidas">{num(op.largura)} × {num(op.altura)} m</Linha>}
              {Number(op.areaM2) > 0 && <Linha rotulo="Área total">{num(op.areaM2)} m²</Linha>}
              <Linha rotulo="Acabamentos">{op.acabamentos.join(', ') || '—'}</Linha>
              <Linha rotulo="Máquina">{op.maquina?.nome ?? '—'}</Linha>
              <Linha rotulo="Responsável">{op.responsavel?.nome ?? '—'}</Linha>
            </dl>
            <dl className="text-sm">
              <Linha rotulo="Horas estimadas">{num(op.horasEstimadas)} h</Linha>
              <Linha rotulo="Início previsto">{formatarDataSimples(op.dataInicioPrevista)}</Linha>
              <Linha rotulo="Término previsto">{formatarDataSimples(op.dataFimPrevista ?? op.pedido.dataPrevistaEntrega)}</Linha>
              <Linha rotulo="Início real">{formatarDataHora(op.dataInicioReal)}</Linha>
              <Linha rotulo="Término real">{formatarDataHora(op.dataFimReal)}</Linha>
            </dl>
            {op.observacoes && <p className="rounded-lg bg-ambar/10 p-3 text-sm sm:col-span-2">{op.observacoes}</p>}
            <Can modulo="producao" acao="editar">
              <div className="flex items-center gap-2 sm:col-span-2">
                <span className="text-sm text-texto-secundario">Mover para</span>
                <div className="w-52">
                  <Select
                    aria-label="Mover para a etapa"
                    value={op.etapaAtual}
                    onChange={(e) => void mover(op, e.target.value as EtapaProducao, []).catch(() => undefined)}
                  >
                    {ETAPAS_PRODUCAO.map((e) => (
                      <option key={e} value={e}>
                        {mapa.get(`producao:${e}`)?.rotulo ?? e}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </Can>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              Arte {op.arte && <span className="text-sm font-normal text-texto-secundario">v{op.arte.versao}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-fundo">
              {op.arte?.miniaturaUrl ? (
                <img src={op.arte.miniaturaUrl} alt={`Arte de ${op.item.descricao}`} className="h-full w-full object-contain" />
              ) : (
                <ImageOff className="h-8 w-8 text-texto-secundario" />
              )}
            </div>
            <StatusBadge entidade="arte" codigo={op.arte?.status ?? 'aguardando_arquivo'} />
          </CardContent>
        </Card>
        <div className="space-y-4 lg:col-span-2">
          <Apontamentos op={op} />
          <InsumosBaixados op={op} />
        </div>
        <HistoricoEtapas historico={op.historico} />
      </div>
      {reprogramando && <ReprogramarOpDialog op={op} onFechar={() => setReprogramando(false)} />}
      <OverrideDialog op={override} onConfirmar={confirmarOverride} onCancelar={cancelarOverride} />
    </>
  )
}
