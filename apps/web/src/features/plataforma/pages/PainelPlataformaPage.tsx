import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertOctagon, AlertTriangle, Info, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { CATEGORIA_EMPRESA_ROTULOS, formatarData, formatarMoeda, type CategoriaEmpresa, type GravidadeProblema } from '@onprint/shared'
import { PageHeader } from '@/components/layout/PageHeader'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { plataformaApi } from '../api'
import { COR_CATEGORIA } from '../components/cores'

/** Categoria → filtro da lista de empresas. */
const FILTRO: Record<CategoriaEmpresa, string> = {
  em_dia: 'situacao=ativa&nivel=normal',
  teste: 'situacao=teste',
  aviso: 'nivel=aviso',
  somente_leitura: 'nivel=somente_leitura',
  bloqueada: 'nivel=bloqueado',
  cancelada: 'situacao=cancelada',
}
const GRAVIDADE: Record<GravidadeProblema, { Icone: typeof Info; cor: string; rotulo: string }> = {
  alta: { Icone: AlertOctagon, cor: 'text-coral-escuro', rotulo: 'Alta' },
  media: { Icone: AlertTriangle, cor: 'text-amber-800', rotulo: 'Média' },
  baixa: { Icone: Info, cor: 'text-sky-800', rotulo: 'Baixa' },
}

/** Visão geral: quantas empresas em cada situação, receita e o que precisa de atenção. */
export function PainelPlataformaPage() {
  const queryClient = useQueryClient()
  const consulta = useQuery({ queryKey: ['plataforma', 'painel'], queryFn: plataformaApi.painel, refetchInterval: 60_000 })
  const atualizar = () => queryClient.invalidateQueries({ queryKey: ['plataforma'] })
  const conciliar = useMutation({
    mutationFn: plataformaApi.conciliar,
    onSuccess: (r) => {
      toast.success(`Conferência feita: ${r.cobrancas} cobrança(s) do Asaas, ${r.assinaturas} assinatura(s).${r.falhas.length ? ` ${r.falhas.length} falha(s).` : ''}`)
      void atualizar()
    },
    onError: (e) => toast.error((e as Error).message),
  })
  const reprocessar = useMutation({
    mutationFn: plataformaApi.reprocessar,
    onSuccess: () => {
      toast.success('Aviso aplicado.')
      void atualizar()
    },
    onError: (e) => toast.error((e as Error).message),
  })
  const p = consulta.data

  return (
    <>
      <PageHeader
        titulo="Painel da plataforma"
        subtitulo="Assinantes, receita e o que precisa de atenção. Atualiza sozinho a cada minuto."
        acoes={
          p?.pagamentoOnline && (
            <Button variant="outline" onClick={() => conciliar.mutate()} disabled={conciliar.isPending}>
              {conciliar.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Conferir com o Asaas
            </Button>
          )
        }
      />
      {consulta.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : consulta.isError || !p ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {(Object.keys(CATEGORIA_EMPRESA_ROTULOS) as CategoriaEmpresa[]).map((c) => (
              <Link key={c} to={`/plataforma/empresas?${FILTRO[c]}`} className="rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md">
                <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold', COR_CATEGORIA[c])}>{CATEGORIA_EMPRESA_ROTULOS[c]}</span>
                <p className="mt-2 font-titulo text-3xl font-extrabold text-grafite">{p.indicadores.porCategoria[c]}</p>
              </Link>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Receita mensal (em dia)', p.indicadores.receitaMensal, 'text-green-800'],
              ['Mensalidades em risco (atraso)', p.indicadores.receitaEmRisco, 'text-amber-900'],
              ['Recebido neste mês', p.recebidoNoMes, 'text-grafite'],
              ['Cobranças vencidas', p.emAtraso, 'text-coral-escuro'],
            ].map(([rotulo, valor, cor]) => (
              <Card key={rotulo} className="p-4">
                <p className="text-xs text-texto-secundario">{rotulo}</p>
                <p className={cn('text-xl font-semibold', cor)}>{formatarMoeda(valor)}</p>
              </Card>
            ))}
          </div>
          <p className="text-sm text-texto-secundario">
            {p.indicadores.total} empresa(s) no total · {p.novasEmpresas30Dias} nova(s) nos últimos 30 dias · {p.conversoes30Dias} teste(s) que viraram assinatura
            {!p.pagamentoOnline && ' · Pagamento online desligado (modo manual)'}
          </p>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Precisa de atenção ({p.problemas.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {p.problemas.length === 0 ? (
                <p className="text-sm text-texto-secundario">Nenhum problema agora.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {p.problemas.map((pr, i) => {
                    const g = GRAVIDADE[pr.gravidade]
                    return (
                      <li key={`${pr.tipo}-${pr.empresa?.id ?? pr.eventoId}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                        <g.Icone className={cn('h-4 w-4 shrink-0', g.cor)} aria-label={`Gravidade ${g.rotulo}`} />
                        {pr.empresa ? (
                          <Link to={`/plataforma/empresas/${pr.empresa.id}`} className="font-semibold text-grafite hover:underline">
                            {pr.empresa.nome}
                          </Link>
                        ) : (
                          <span className="font-semibold text-grafite">Asaas</span>
                        )}
                        <span className="min-w-0 flex-1">{pr.descricao}</span>
                        <span className="text-xs text-texto-secundario">{formatarData(pr.data)}</span>
                        {pr.eventoId && (
                          <Button size="sm" variant="outline" disabled={reprocessar.isPending} onClick={() => reprocessar.mutate(pr.eventoId as string)}>
                            Reprocessar
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
