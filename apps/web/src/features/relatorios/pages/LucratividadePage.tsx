import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AlertTriangle, FileSpreadsheet, Info, TrendingUp } from 'lucide-react'
import { formatarDataSimples, formatarMoeda, type LinhaLucratividade, type RelatorioLucratividade } from '@onprint/shared'
import { relatoriosApi } from '@/api/relatorios'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { SemaforoLucro } from '@/features/produtos/components/custo/SemaforoLucro'
import { ROTULO_SEMAFORO, formatarPercentual } from '@/features/produtos/custos'
import { usePermission } from '@/hooks/usePermission'
import { baixarArquivo, gerarCsv } from '@/lib/csv'
import { bandejaAbas, classeAba } from '@/lib/estilosAbas'
import { valorCsv } from '@/lib/formatoValor'
import { cn } from '@/lib/utils'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { usePeriodo } from '../periodo'

type Agrupar = 'pedido' | 'produto'
const AGRUPAR: Record<Agrupar, string> = { pedido: 'Por pedido', produto: 'Por produto' }

const negativo = (v: string | number | null | undefined) => Number(v ?? 0) < 0

function Cartao({ rotulo, valor, detalhe, destaque, className }: { rotulo: string; valor: string; detalhe?: ReactNode; destaque?: boolean; className?: string }) {
  return (
    <div className={cn('rounded-3xl p-4 shadow-suave sm:p-5', destaque ? 'bg-grafite text-white' : 'bg-card', className)}>
      <p className={cn('text-xs font-semibold uppercase tracking-wide', destaque ? 'text-white/70' : 'text-texto-secundario')}>{rotulo}</p>
      <p className={cn('mt-1 font-titulo text-xl font-extrabold tabular-nums sm:text-2xl', !destaque && 'text-tinta')}>{valor}</p>
      {detalhe && <div className={cn('mt-1 text-xs', destaque ? 'text-white/70' : 'text-texto-secundario')}>{detalhe}</div>}
    </div>
  )
}

function Titulo({ linha, agrupar }: { linha: LinhaLucratividade; agrupar: Agrupar }) {
  return (
    <div className="min-w-0">
      {agrupar === 'pedido' ? (
        <Link to={`/pedidos/${linha.id}`} className="font-semibold text-marca-escuro underline-offset-2 hover:underline">
          {linha.titulo}
        </Link>
      ) : (
        <span className="font-semibold text-tinta">{linha.titulo}</span>
      )}
      {linha.subtitulo && <p className="truncate text-xs text-texto-secundario">{linha.subtitulo}</p>}
    </div>
  )
}

function exportarCsv(r: RelatorioLucratividade, agrupar: Agrupar, comReal: boolean, nome: string) {
  const m = (v: string | null) => valorCsv(v, 'moeda')
  const csv = gerarCsv<LinhaLucratividade>(
    [
      { titulo: agrupar === 'pedido' ? 'Pedido' : 'Produto', valor: (l) => l.titulo },
      { titulo: agrupar === 'pedido' ? 'Cliente' : 'Código', valor: (l) => l.subtitulo },
      { titulo: 'Receita', valor: (l) => m(l.receita) },
      { titulo: 'Custo estimado', valor: (l) => m(l.custoEstimado) },
      ...(comReal ? [{ titulo: 'Custo real de materiais', valor: (l: LinhaLucratividade) => m(l.custoMateriaisReal) }] : []),
      { titulo: 'Despesas (impostos, comissão, fixo)', valor: (l) => m(l.despesas) },
      { titulo: 'Lucro', valor: (l) => m(l.lucro) },
      { titulo: 'Lucro %', valor: (l) => valorCsv(l.lucroPercentual, 'percentual') },
      { titulo: 'Situação', valor: (l) => ROTULO_SEMAFORO[l.situacao] },
    ],
    r.linhas,
  )
  baixarArquivo(csv, `${nome}.csv`)
}

/** Relatórios → Lucratividade: receita, custo, despesas e lucro por pedido ou por produto no período. */
export function LucratividadePage() {
  const periodo = usePeriodo()
  const [agrupar, setAgrupar] = useState<Agrupar>('pedido')
  const podeExportar = usePermission('relatorios', 'exportar')
  const q = { inicio: periodo.datas.de, fim: periodo.datas.ate, agrupar }
  const consulta = useQuery({ queryKey: ['relatorios', 'lucratividade', q], queryFn: () => relatoriosApi.lucratividade(q), placeholderData: keepPreviousData, enabled: q.inicio <= q.fim })
  const datasInvertidas = q.inicio > q.fim
  const r = consulta.data
  const comReal = Boolean(r?.linhas.some((l) => l.custoMateriaisReal !== null))
  const t = r?.totais

  return (
    <>
      <PageHeader
        titulo="Lucratividade"
        subtitulo={`${formatarDataSimples(periodo.datas.de)} a ${formatarDataSimples(periodo.datas.ate)} · quanto sobrou de cada venda depois do custo e das despesas`}
        acoes={
          podeExportar && r ? (
            <Button variant="outline" onClick={() => exportarCsv(r, agrupar, comReal, `lucratividade-${agrupar}-${q.inicio}-a-${q.fim}`)} disabled={!r.linhas.length}>
              <FileSpreadsheet /> CSV
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav className={cn(bandejaAbas, 'mb-0')} aria-label="Agrupar por">
          {(Object.keys(AGRUPAR) as Agrupar[]).map((a) => (
            <button key={a} type="button" aria-pressed={agrupar === a} onClick={() => setAgrupar(a)} className={classeAba(agrupar === a)}>
              {AGRUPAR[a]}
            </button>
          ))}
        </nav>
        <SeletorPeriodo estado={periodo} carregando={consulta.isFetching} />
      </div>

      {datasInvertidas ? (
        <Card>
          <EmptyState icone={TrendingUp} titulo="Confira as datas" descricao="A data final precisa ser depois da inicial." />
        </Card>
      ) : consulta.isPending ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-3xl" />
            ))}
          </div>
          <Skeleton className="h-80 w-full rounded-3xl" />
        </div>
      ) : consulta.isError || !r || !t ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <div className={cn('space-y-4 transition-opacity', consulta.isPlaceholderData && 'opacity-70')}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Cartao rotulo="Receita" valor={formatarMoeda(t.receita)} detalhe={`${r.linhas.length} ${agrupar === 'pedido' ? (r.linhas.length === 1 ? 'pedido' : 'pedidos') : r.linhas.length === 1 ? 'produto' : 'produtos'}`} />
            <Cartao rotulo="Custo" valor={formatarMoeda(t.custoEstimado)} detalhe={t.custoMateriaisReal !== null ? `Materiais de fato: ${formatarMoeda(t.custoMateriaisReal)}` : 'Estimado na venda'} />
            <Cartao rotulo="Despesas" valor={formatarMoeda(t.despesas)} detalhe="Impostos, comissão e custos fixos" />
            <Cartao rotulo="Lucro" valor={formatarMoeda(t.lucro)} destaque className={negativo(t.lucro) ? 'ring-2 ring-coral' : undefined} detalhe={r.semCusto.quantidade ? 'Só das vendas com custo informado' : 'Receita − custo − despesas'} />
            <Cartao rotulo="Lucro %" valor={formatarPercentual(t.lucroPercentual)} className="col-span-2 lg:col-span-1" detalhe={<SemaforoLucro situacao={t.situacao} className="mt-1" />} />
          </div>

          {r.semCusto.quantidade > 0 && (
            <div role="status" className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                <strong>
                  {r.semCusto.quantidade} {agrupar === 'pedido' ? (r.semCusto.quantidade === 1 ? 'pedido' : 'pedidos') : r.semCusto.quantidade === 1 ? 'produto' : 'produtos'} sem custo informado
                </strong>{' '}
                ({formatarMoeda(r.semCusto.receita)} de receita) {r.semCusto.quantidade === 1 ? 'ficou' : 'ficaram'} fora do lucro total — sem custo, pareceriam 100% de lucro. Informe o custo
                dos produtos em Produtos → Custo e preço para um resultado real.
              </p>
            </div>
          )}

          {r.linhas.length === 0 ? (
            <Card>
              <EmptyState icone={TrendingUp} titulo="Nenhuma venda no período" descricao="Os pedidos (não cancelados) com data no período aparecem aqui. Escolha outro período." />
            </Card>
          ) : (
            <>
              {/* Celular: cartões */}
              <ul className="space-y-2 md:hidden" aria-label="Lucratividade">
                {r.linhas.map((l) => (
                  <li key={l.id} className="rounded-2xl bg-card p-4 shadow-suave">
                    <div className="flex items-start justify-between gap-3">
                      <Titulo linha={l} agrupar={agrupar} />
                      <SemaforoLucro situacao={l.situacao} lucroPercentual={l.lucroPercentual} className="shrink-0" />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <dt className="text-texto-secundario">Receita</dt>
                      <dd className="text-right tabular-nums">{formatarMoeda(l.receita)}</dd>
                      <dt className="text-texto-secundario">Custo</dt>
                      <dd className="text-right tabular-nums">{formatarMoeda(l.custoEstimado)}</dd>
                      {comReal && (
                        <>
                          <dt className="text-texto-secundario">Materiais de fato</dt>
                          <dd className="text-right tabular-nums">{l.custoMateriaisReal !== null ? formatarMoeda(l.custoMateriaisReal) : '—'}</dd>
                        </>
                      )}
                      <dt className="text-texto-secundario">Despesas</dt>
                      <dd className="text-right tabular-nums">{formatarMoeda(l.despesas)}</dd>
                      <dt className="font-semibold text-tinta">Lucro</dt>
                      <dd className={cn('text-right font-semibold tabular-nums', negativo(l.lucro) ? 'text-coral-escuro' : 'text-tinta')}>{formatarMoeda(l.lucro)}</dd>
                    </dl>
                  </li>
                ))}
              </ul>

              {/* Desktop: tabela */}
              <Card className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-fundo/60 text-left text-xs uppercase text-texto-secundario">
                    <tr>
                      <th className="px-4 py-3 font-medium">{agrupar === 'pedido' ? 'Pedido' : 'Produto'}</th>
                      <th className="px-4 py-3 text-right font-medium">Receita</th>
                      <th className="px-4 py-3 text-right font-medium">Custo estimado</th>
                      {comReal && (
                        <th className="px-4 py-3 text-right font-medium" title="Materiais que saíram do estoque para este pedido, ao custo do momento">
                          Custo real de materiais
                        </th>
                      )}
                      <th className="px-4 py-3 text-right font-medium">Despesas</th>
                      <th className="px-4 py-3 text-right font-medium">Lucro</th>
                      <th className="px-4 py-3 font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {r.linhas.map((l) => (
                      <tr key={l.id} className="hover:bg-fundo/40">
                        <td className="max-w-xs px-4 py-2.5">
                          <Titulo linha={l} agrupar={agrupar} />
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatarMoeda(l.receita)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatarMoeda(l.custoEstimado)}</td>
                        {comReal && <td className="px-4 py-2.5 text-right tabular-nums">{l.custoMateriaisReal !== null ? formatarMoeda(l.custoMateriaisReal) : <span className="text-texto-secundario">—</span>}</td>}
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatarMoeda(l.despesas)}</td>
                        <td className={cn('px-4 py-2.5 text-right font-semibold tabular-nums', negativo(l.lucro) ? 'text-coral-escuro' : 'text-tinta')}>{formatarMoeda(l.lucro)}</td>
                        <td className="px-4 py-2.5">
                          <SemaforoLucro situacao={l.situacao} lucroPercentual={l.lucroPercentual} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-border bg-fundo/60 font-semibold text-tinta">
                    <tr>
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatarMoeda(t.receita)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatarMoeda(t.custoEstimado)}</td>
                      {comReal && <td className="px-4 py-3 text-right tabular-nums">{t.custoMateriaisReal !== null ? formatarMoeda(t.custoMateriaisReal) : '—'}</td>}
                      <td className="px-4 py-3 text-right tabular-nums">{formatarMoeda(t.despesas)}</td>
                      <td className={cn('px-4 py-3 text-right tabular-nums', negativo(t.lucro) && 'text-coral-escuro')}>{formatarMoeda(t.lucro)}</td>
                      <td className="px-4 py-3">
                        <SemaforoLucro situacao={t.situacao} lucroPercentual={t.lucroPercentual} />
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </Card>
            </>
          )}
          <p className="flex items-start gap-1.5 text-xs text-texto-secundario">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Pedidos não cancelados com data no período. Custo estimado: o calculado na venda (materiais, produção e acabamentos). Custo real de materiais: o que saiu do estoque para o pedido, quando houve baixa. Despesas: impostos, comissão e custos fixos (%) da Precificação.
          </p>
        </div>
      )}
    </>
  )
}
