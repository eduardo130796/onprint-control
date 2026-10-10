import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { BarChart3, FileDown, FileSpreadsheet, Info, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { RELATORIOS, formatarDataSimples, type TipoRelatorio } from '@onprint/shared'
import { relatoriosApi } from '@/api/relatorios'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { BarrasHorizontais, BarrasVerticais } from '@/components/shared/graficos/Barras'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useEmpresa } from '@/features/configuracoes/hooks'
import { usePermission } from '@/hooks/usePermission'
import { baixarArquivo, gerarCsv } from '@/lib/csv'
import { formatarValor, valorCsv } from '@/lib/formatoValor'
import { bandejaAbas, classeAba } from '@/lib/estilosAbas'
import { cn } from '@/lib/utils'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { usePeriodo } from '../periodo'
import { CartaoIndicador } from '@/components/shared/CartaoIndicador'

/**
 * DRE: a linha "Custo dos materiais consumidos" é informativa (vem das baixas de estoque, não do caixa).
 * Reconhece pela marca `informativo` ou pelo nome da linha.
 */
function linhaInformativa(l: Record<string, unknown>): boolean {
  if (l.informativo === true || l.informativo === 'true' || l.informativo === 1) return true
  return Object.values(l).some((v) => typeof v === 'string' && /custo dos materiais consumidos/i.test(v))
}
const DICA_MATERIAIS = 'Informativo: pelas baixas de estoque do período (produção, balcão e perdas), ao custo da movimentação. A DRE segue por caixa nas demais linhas.'

/** Relatório genérico (seção 11): visões em abas, período, resumo, gráfico, tabela e exportação CSV/PDF. */
export function RelatorioPage({ tipo }: { tipo: TipoRelatorio }) {
  const def = RELATORIOS[tipo]
  const visoes = Object.entries(def.visoes)
  const empresa = useEmpresa()
  const podeExportar = usePermission('relatorios', 'exportar')
  const [visao, setVisao] = useState(visoes[0]![0])
  const periodo = usePeriodo()
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const { datas } = periodo
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
      await baixarPdfRelatorio(r, empresa.data?.nomeFantasia || empresa.data?.razaoSocial || 'GrafyGo', nomeArquivo)
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
      <div className="mb-4">
        <SeletorPeriodo estado={periodo} carregando={consulta.isFetching} />
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
              <CartaoIndicador key={x.rotulo} compacto rotulo={x.rotulo} valor={formatarValor(x.valor, x.formato)} />
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
                      <BarrasVerticais dados={r.linhas.filter((l) => !linhaInformativa(l))} rotulo={r.grafico.rotulo} series={r.grafico.series} formato={r.grafico.formato} />
                    ) : (
                      <BarrasHorizontais dados={r.linhas.filter((l) => !linhaInformativa(l))} rotulo={r.grafico.rotulo} series={r.grafico.series} formato={r.grafico.formato} />
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
                    {r.linhas.map((l, i) => {
                      const informativa = linhaInformativa(l)
                      const ultimaTexto = informativa ? r.colunas.filter((c) => c.formato === 'texto').at(-1)?.chave : undefined
                      return (
                        <tr key={i} className={cn('hover:bg-fundo/40', informativa && 'bg-fundo/60 italic text-texto-secundario')} title={informativa ? DICA_MATERIAIS : undefined}>
                          {r.colunas.map((c) => (
                            <td key={c.chave} className={cn('px-4 py-2.5', !['texto', 'data'].includes(c.formato) && 'text-right tabular-nums')}>
                              {formatarValor(l[c.chave], c.formato)}
                              {c.chave === ultimaTexto && (
                                <span className="mt-0.5 flex items-start gap-1 text-xs not-italic text-texto-secundario">
                                  <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /> {DICA_MATERIAIS}
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
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
