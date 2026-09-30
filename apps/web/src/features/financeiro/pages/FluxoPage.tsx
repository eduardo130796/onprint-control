import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adicionarDias, formatarDataSimples, formatarMoeda, hojeISO, type DiaFluxo } from '@onprint/shared'
import { financeiroApi } from '@/api/financeiro'
import { PageHeader } from '@/components/layout/PageHeader'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useContasFinanceiras } from '../hooks'

const PERIODOS = { '30': 'Próximos 30 dias', '60': 'Próximos 60 dias', '90': 'Próximos 90 dias', mes: 'Este mês', passado: 'Últimos 30 dias', livre: 'Escolher datas' } as const

function intervalo(p: keyof typeof PERIODOS, hoje: string) {
  if (p === 'mes') {
    const [a, m] = hoje.split('-').map(Number) as [number, number]
    return { de: `${hoje.slice(0, 8)}01`, ate: `${hoje.slice(0, 8)}${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}` }
  }
  if (p === 'passado') return { de: adicionarDias(hoje, -30), ate: hoje }
  return { de: hoje, ate: adicionarDias(hoje, Number(p === 'livre' ? 30 : p)) }
}

/** Barras diárias: entradas (verde) e saídas (coral), realizadas cheias e previstas claras. */
function Grafico({ dias }: { dias: DiaFluxo[] }) {
  const max = Math.max(1, ...dias.map((d) => Math.max(Number(d.entradas) + Number(d.previstoEntradas), Number(d.saidas) + Number(d.previstoSaidas))))
  const altura = (v: number) => `${Math.round((v / max) * 100)}%`
  return (
    <div className="overflow-x-auto">
      <div className="flex h-48 min-w-full items-end gap-px" style={{ width: `${Math.max(dias.length * 14, 600)}px` }}>
        {dias.map((d) => (
          <div key={d.data} className="group relative flex h-full flex-1 items-end gap-px" title={`${formatarDataSimples(d.data)} · entradas ${formatarMoeda(Number(d.entradas) + Number(d.previstoEntradas))} · saídas ${formatarMoeda(Number(d.saidas) + Number(d.previstoSaidas))} · saldo projetado ${formatarMoeda(d.saldoProjetado)}`}>
            <div className="flex h-full flex-1 flex-col justify-end">
              <div className="bg-verde/35" style={{ height: altura(Number(d.previstoEntradas)) }} />
              <div className="bg-verde" style={{ height: altura(Number(d.entradas)) }} />
            </div>
            <div className="flex h-full flex-1 flex-col justify-end">
              <div className="bg-coral/35" style={{ height: altura(Number(d.previstoSaidas)) }} />
              <div className="bg-coral" style={{ height: altura(Number(d.saidas)) }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-texto-secundario">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 bg-verde" /> Recebido</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 bg-verde/35" /> A receber</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 bg-coral" /> Pago</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 bg-coral/35" /> A pagar</span>
      </div>
    </div>
  )
}

/** Fluxo de caixa: saldo realizado, previsto pelos títulos em aberto e resumo por categoria. */
export function FluxoPage() {
  const hoje = hojeISO()
  const contas = useContasFinanceiras()
  const [periodo, setPeriodo] = useState<keyof typeof PERIODOS>('30')
  const [livre, setLivre] = useState(intervalo('30', hoje))
  const [contaId, setContaId] = useState('')
  const datas = periodo === 'livre' ? livre : intervalo(periodo, hoje)
  const q = { ...datas, contaFinanceiraId: contaId || undefined }
  const consulta = useQuery({ queryKey: ['financeiro', 'fluxo', q], queryFn: () => financeiroApi.fluxo(q) })
  const f = consulta.data

  return (
    <>
      <PageHeader titulo="Fluxo de caixa" subtitulo="Realizado (movimentos) e previsto (contas em aberto; as vencidas entram no dia de hoje)." />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="w-48">
          <Select value={periodo} onChange={(e) => setPeriodo(e.target.value as keyof typeof PERIODOS)} aria-label="Período">
            {Object.entries(PERIODOS).map(([k, r]) => (
              <option key={k} value={k}>
                {r}
              </option>
            ))}
          </Select>
        </div>
        {periodo === 'livre' && (
          <>
            <Input type="date" className="w-40" value={livre.de} onChange={(e) => setLivre((l) => ({ ...l, de: e.target.value }))} aria-label="De" />
            <Input type="date" className="w-40" value={livre.ate} onChange={(e) => setLivre((l) => ({ ...l, ate: e.target.value }))} aria-label="Até" />
          </>
        )}
        <div className="w-48">
          <Select value={contaId} onChange={(e) => setContaId(e.target.value)} aria-label="Conta">
            <option value="">Todas as contas</option>
            {contas.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {consulta.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : consulta.isError || !f ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ['Saldo inicial', f.saldoInicial, 'text-petroleo'],
              ['Entradas (+ previstas)', `${f.totais.entradas}|${f.totais.previstoEntradas}`, 'text-green-800'],
              ['Saídas (+ previstas)', `${f.totais.saidas}|${f.totais.previstoSaidas}`, 'text-coral-escuro'],
              ['Saldo realizado', f.totais.saldoFinal, 'text-petroleo'],
              ['Saldo projetado', f.totais.saldoProjetado, Number(f.totais.saldoProjetado) < 0 ? 'text-coral-escuro' : 'text-turquesa-escuro'],
            ].map(([rotulo = '', valor = '', cor]) => {
              const [real, prev] = valor.split('|')
              return (
                <Card key={rotulo} className="p-4">
                  <p className="text-xs text-texto-secundario">{rotulo}</p>
                  <p className={cn('text-lg font-semibold', cor)}>{formatarMoeda(real)}</p>
                  {prev !== undefined && <p className="text-xs text-texto-secundario">+ {formatarMoeda(prev)} previsto</p>}
                </Card>
              )
            })}
          </div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {formatarDataSimples(f.de)} a {formatarDataSimples(f.ate)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Grafico dias={f.dias} />
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Dia a dia</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-texto-secundario">
                    <tr>
                      <th className="py-2">Dia</th>
                      <th className="py-2 text-right">Entradas</th>
                      <th className="py-2 text-right">Saídas</th>
                      <th className="py-2 text-right">A receber</th>
                      <th className="py-2 text-right">A pagar</th>
                      <th className="py-2 text-right">Saldo projetado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {f.dias
                      .filter((d) => [d.entradas, d.saidas, d.previstoEntradas, d.previstoSaidas].some((x) => Number(x) !== 0))
                      .map((d) => (
                        <tr key={d.data}>
                          <td className="py-2">{formatarDataSimples(d.data)}</td>
                          <td className="py-2 text-right text-green-800">{Number(d.entradas) ? formatarMoeda(d.entradas) : ''}</td>
                          <td className="py-2 text-right text-coral-escuro">{Number(d.saidas) ? formatarMoeda(d.saidas) : ''}</td>
                          <td className="py-2 text-right text-texto-secundario">{Number(d.previstoEntradas) ? formatarMoeda(d.previstoEntradas) : ''}</td>
                          <td className="py-2 text-right text-texto-secundario">{Number(d.previstoSaidas) ? formatarMoeda(d.previstoSaidas) : ''}</td>
                          <td className={cn('py-2 text-right font-medium', Number(d.saldoProjetado) < 0 && 'text-coral-escuro')}>{formatarMoeda(d.saldoProjetado)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Por categoria (realizado)</CardTitle>
              </CardHeader>
              <CardContent>
                {f.porCategoria.length === 0 ? (
                  <p className="text-sm text-texto-secundario">Nenhum movimento no período.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {f.porCategoria.map((c) => (
                      <li key={`${c.tipo}${c.categoria}`} className="flex justify-between gap-2">
                        <span>{c.categoria}</span>
                        <span className={c.tipo === 'entrada' ? 'text-green-800' : 'text-coral-escuro'}>
                          {c.tipo === 'entrada' ? '+' : '−'} {formatarMoeda(c.valor)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  )
}
