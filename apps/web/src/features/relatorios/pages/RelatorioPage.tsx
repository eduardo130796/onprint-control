import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { BarChart3, FileDown, FileSpreadsheet, Info, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { RELATORIOS, adicionarDias, formatarDataSimples, hojeISO, type TipoRelatorio } from '@onprint/shared'
import { relatoriosApi } from '@/api/relatorios'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { BarrasHorizontais, BarrasVerticais } from '@/components/shared/graficos/Barras'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useEmpresa } from '@/features/configuracoes/hooks'
import { usePermission } from '@/hooks/usePermission'
import { baixarArquivo, gerarCsv } from '@/lib/csv'
import { formatarValor, valorCsv } from '@/lib/formatoValor'
import { bandejaAbas, classeAba } from '@/lib/estilosAbas'
import { cn } from '@/lib/utils'

const PERIODOS = { mes: 'Este mês', anterior: 'Mês passado', '90': 'Últimos 90 dias', ano: 'Este ano', livre: 'Escolher datas' } as const
type Periodo = keyof typeof PERIODOS

function intervalo(p: Periodo, hoje: string) {
  const [a, m] = hoje.split('-').map(Number) as [number, number]
  const ultimoDia = (ano: number, mes: number) => String(new Date(Date.UTC(ano, mes, 0)).getUTCDate()).padStart(2, '0')
  if (p === 'anterior') {
    const [pa, pm] = m === 1 ? [a - 1, 12] : [a, m - 1]
    const mes = `${pa}-${String(pm).padStart(2, '0')}`
    return { de: `${mes}-01`, ate: `${mes}-${ultimoDia(pa, pm)}` }
  }
  if (p === '90') return { de: adicionarDias(hoje, -89), ate: hoje }
  if (p === 'ano') return { de: `${a}-01-01`, ate: hoje }
  return { de: `${hoje.slice(0, 8)}01`, ate: hoje }
}

/** Relatório genérico (seção 11): visões em abas, período, resumo, gráfico, tabela e exportação CSV/PDF. */
export function RelatorioPage({ tipo }: { tipo: TipoRelatorio }) {
  const def = RELATORIOS[tipo]
  const visoes = Object.entries(def.visoes)
  const hoje = hojeISO()
  const empresa = useEmpresa()
  const podeExportar = usePermission('relatorios', 'exportar')
  const [visao, setVisao] = useState(visoes[0]![0])
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [livre, setLivre] = useState(intervalo('mes', hoje))
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const datas = periodo === 'livre' ? livre : intervalo(periodo, hoje)
  const q = { visao, ...datas }
  const consulta = useQuery({ queryKey: ['relatorios', tipo, q], queryFn: () => relatoriosApi.obter(tipo, q), placeholderData: keepPreviousData })
  const r = consulta.data
  const nomeArquivo = `${tipo}-${visao}-${datas.de}-a-${datas.ate}`

  function exportarCsv() {
    if (!r) return
    const csv = gerarCsv(
      r.colunas.map((c) => ({ titulo: c.titulo, valor: (l: Record<string, string | number | null>) => valorCsv(l[c.chave], c.formato) })),
      r.linhas,
    )
    baixarArquivo(csv, `${nomeArquivo}.csv`)
  }

  async function exportarPdf() {
    if (!r) return
    setGerandoPdf(true)
    try {
      const { baixarPdfRelatorio } = await import('../components/gerarPdfRelatorio')
      await baixarPdfRelatorio(r, empresa.data?.nomeFantasia || empresa.data?.razaoSocial || 'ONPrint Control', nomeArquivo)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGerandoPdf(false)
    }
  }

  return (
    <>
      <PageHeader
        titulo={def.titulo}
        subtitulo={r?.periodo ? `${formatarDataSimples(r.periodo.de)} a ${formatarDataSimples(r.periodo.ate)}` : 'Posição atual'}
        acoes={
          podeExportar && r ? (
            <>
              <Button variant="outline" onClick={exportarCsv} disabled={!r.linhas.length}>
                <FileSpreadsheet /> CSV
              </Button>
              <Button variant="outline" onClick={() => void exportarPdf()} disabled={gerandoPdf}>
                {gerandoPdf ? <Loader2 className="animate-spin" /> : <FileDown />} PDF
              </Button>
            </>
          ) : undefined
        }
      />
      <nav className={cn(bandejaAbas, 'mb-4')} aria-label="Visões do relatório">
        {visoes.map(([chave, titulo]) => (
          <button
            key={chave}
            type="button"
            onClick={() => setVisao(chave)}
            className={classeAba(visao === chave)}
          >
            {titulo}
          </button>
        ))}
      </nav>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="w-44">
          <Select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} aria-label="Período">
            {Object.entries(PERIODOS).map(([k, t]) => (
              <option key={k} value={k}>
                {t}
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
        {consulta.isFetching && <Loader2 className="h-5 w-5 animate-spin self-center text-marca-escuro" />}
      </div>

      {consulta.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : consulta.isError || !r ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {r.resumo.map((x) => (
              <Card key={x.rotulo} className="p-4">
                <p className="text-xs text-texto-secundario">{x.rotulo}</p>
                <p className="text-xl font-semibold text-grafite">{formatarValor(x.valor, x.formato)}</p>
              </Card>
            ))}
          </div>
          {r.linhas.length === 0 ? (
            <Card>
              <EmptyState icone={BarChart3} titulo="Nada no período" descricao="Escolha outro período ou outra visão." />
            </Card>
          ) : (
            <>
              {r.grafico && (
                <Card>
                  <CardContent className="pt-6">
                    {r.grafico.tipo === 'barras' ? (
                      <BarrasVerticais dados={r.linhas} rotulo={r.grafico.rotulo} series={r.grafico.series} formato={r.grafico.formato} />
                    ) : (
                      <BarrasHorizontais dados={r.linhas} rotulo={r.grafico.rotulo} series={r.grafico.series} formato={r.grafico.formato} />
                    )}
                  </CardContent>
                </Card>
              )}
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-fundo/60 text-left text-xs uppercase text-texto-secundario">
                    <tr>
                      {r.colunas.map((c) => (
                        <th key={c.chave} className={cn('whitespace-nowrap px-4 py-3 font-medium', !['texto', 'data'].includes(c.formato) && 'text-right')}>
                          {c.titulo}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {r.linhas.map((l, i) => (
                      <tr key={i} className="hover:bg-fundo/40">
                        {r.colunas.map((c) => (
                          <td key={c.chave} className={cn('px-4 py-2.5', !['texto', 'data'].includes(c.formato) && 'text-right tabular-nums')}>
                            {formatarValor(l[c.chave], c.formato)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}
          {r.observacao && (
            <p className="flex items-start gap-1.5 text-xs text-texto-secundario">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {r.observacao}
            </p>
          )}
        </div>
      )}
    </>
  )
}

export const RelatorioVendasPage = () => <RelatorioPage tipo="vendas" />
export const RelatorioOrcamentosPage = () => <RelatorioPage tipo="orcamentos" />
export const RelatorioProducaoPage = () => <RelatorioPage tipo="producao" />
export const RelatorioEstoquePage = () => <RelatorioPage tipo="estoque" />
export const RelatorioFinanceiroPage = () => <RelatorioPage tipo="financeiro" />
export const RelatorioComissoesPage = () => <RelatorioPage tipo="comissoes" />
