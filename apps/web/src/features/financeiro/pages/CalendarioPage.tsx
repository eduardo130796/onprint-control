import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { diaDaSemana, formatarDataSimples, formatarMoeda, hojeISO, type DiaCalendario } from '@onprint/shared'
import { financeiroApi } from '@/api/financeiro'
import { PageHeader } from '@/components/layout/PageHeader'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { TituloDetalheDialog } from '../components/TituloDetalheDialog'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function mudarMes(mes: string, delta: number) {
  const [a, m] = mes.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(a, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Calendário financeiro: por dia, a receber/a pagar (em aberto) e recebido/pago. */
export function CalendarioPage() {
  const hoje = hojeISO()
  const [mes, setMes] = useState(hoje.slice(0, 7))
  const [dia, setDia] = useState<string>(hoje)
  const [aberto, setAberto] = useState<{ tipo: 'receber' | 'pagar'; id: string } | null>(null)
  const consulta = useQuery({ queryKey: ['financeiro', 'calendario', mes], queryFn: () => financeiroApi.calendario(mes) })
  const porDia = useMemo(() => new Map((consulta.data ?? []).map((d) => [d.data, d])), [consulta.data])
  const [ano, m] = mes.split('-').map(Number) as [number, number]
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate()
  const primeiro = diaDaSemana(`${mes}-01`)
  const celulas: (string | null)[] = [...Array<null>(primeiro).fill(null), ...Array.from({ length: ultimo }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`)]
  const selecionado: DiaCalendario | undefined = porDia.get(dia)

  return (
    <>
      <PageHeader
        titulo="Calendário financeiro"
        subtitulo="Vencimentos e movimentos por dia."
        acoes={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => setMes((x) => mudarMes(x, -1))}>
              <ChevronLeft />
            </Button>
            <span className="w-40 text-center font-semibold capitalize text-tinta">
              {MESES[m - 1]} de {ano}
            </span>
            <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => setMes((x) => mudarMes(x, 1))}>
              <ChevronRight />
            </Button>
          </div>
        }
      />
      {consulta.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : consulta.isError ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-3 lg:col-span-2">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-texto-secundario">
              {SEMANA.map((s) => (
                <span key={s} className="py-1">
                  {s}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {celulas.map((d, i) => {
                if (!d) return <span key={`v${i}`} />
                const info = porDia.get(d)
                const atrasado = d < hoje && info?.titulos.some((t) => ['aberto', 'vencido', 'parcial'].includes(t.status))
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDia(d)}
                    className={cn(
                      'flex min-h-20 flex-col rounded-lg border p-1.5 text-left text-[11px] transition-colors hover:border-marca',
                      d === dia ? 'border-marca bg-marca/5' : 'border-border',
                      d === hoje && 'ring-1 ring-marca',
                    )}
                  >
                    <span className={cn('text-xs font-semibold', atrasado && 'text-coral-escuro')}>{Number(d.slice(8))}</span>
                    {info && Number(info.aReceber) > 0 && <span className="truncate text-marca-escuro">+{formatarMoeda(info.aReceber)}</span>}
                    {info && Number(info.aPagar) > 0 && <span className="truncate text-coral-escuro">−{formatarMoeda(info.aPagar)}</span>}
                    {info && Number(info.recebido) + Number(info.pago) > 0 && <span className="truncate text-texto-secundario">✓ {formatarMoeda(Number(info.recebido) - Number(info.pago))}</span>}
                  </button>
                )
              })}
            </div>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{formatarDataSimples(dia)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!selecionado || selecionado.titulos.length === 0 ? (
                <p className="text-texto-secundario">Nenhum vencimento neste dia.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {selecionado.titulos.map((t) => (
                    <li key={t.id}>
                      <button type="button" className="flex w-full items-center gap-2 py-2 text-left hover:bg-fundo/60" onClick={() => setAberto({ tipo: t.tipo, id: t.id })}>
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', t.tipo === 'receber' ? 'bg-marca' : 'bg-coral')} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{t.descricao}</span>
                          <span className="block truncate text-xs text-texto-secundario">{t.pessoa ?? '—'}</span>
                        </span>
                        <span className="text-right">
                          <span className="block font-medium">{formatarMoeda(t.saldo)}</span>
                          <StatusBadge entidade="conta" codigo={t.status} className="text-[10px]" />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selecionado && (Number(selecionado.recebido) > 0 || Number(selecionado.pago) > 0) && (
                <p className="rounded-lg bg-fundo p-2 text-xs">
                  Recebido {formatarMoeda(selecionado.recebido)} · pago {formatarMoeda(selecionado.pago)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {aberto && <TituloDetalheDialog tipo={aberto.tipo} id={aberto.id} onFechar={() => setAberto(null)} />}
    </>
  )
}
