import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, Info, Loader2, RefreshCw, Sparkles, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { CATEGORIA_EMPRESA_ROTULOS, formatarData, formatarMoeda, type CategoriaEmpresa, type GravidadeProblema } from '@onprint/shared'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { plataformaApi } from '../api'
import { CATEGORIA_SINGULAR, PONTO_CATEGORIA } from '../components/cores'
import { CabecalhoPlataforma, Secao } from '../components/Secao'

const CATEGORIAS = Object.keys(CATEGORIA_EMPRESA_ROTULOS) as CategoriaEmpresa[]
const GRAVIDADE: Record<GravidadeProblema, { Icone: typeof Info; cor: string; fundo: string; rotulo: string }> = {
  alta: { Icone: AlertOctagon, cor: 'text-coral-escuro', fundo: 'bg-coral/10', rotulo: 'Alta' },
  media: { Icone: AlertTriangle, cor: 'text-amber-800', fundo: 'bg-amber-50', rotulo: 'Média' },
  baixa: { Icone: Info, cor: 'text-sky-800', fundo: 'bg-sky-50', rotulo: 'Baixa' },
}

/** Visão geral: receita, quantas empresas em cada situação e o que precisa de atenção. */
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
  const total = p?.indicadores.total || 1

  return (
    <>
      <CabecalhoPlataforma
        sobretitulo="Visão geral"
        titulo="Painel da plataforma"
        subtitulo="Receita, assinantes e o que precisa de atenção. Atualiza sozinho a cada minuto."
        acoes={
          p?.pagamentoOnline && (
            <Button variant="outline" onClick={() => conciliar.mutate()} disabled={conciliar.isPending}>
              {conciliar.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Conferir com o Asaas
            </Button>
          )
        }
      />
      {consulta.isPending ? (
        <div className="space-y-5">
          <Skeleton className="h-56 w-full rounded-3xl" />
          <Skeleton className="h-32 w-full rounded-3xl" />
        </div>
      ) : consulta.isError || !p ? (
        <Secao>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Secao>
      ) : (
        <div className="space-y-5">
          {/* Receita em destaque */}
          <section className="relative overflow-hidden rounded-3xl bg-grafite text-white shadow-xl" aria-label="Receita">
            <div className="pointer-events-none absolute -right-28 -top-32 h-80 w-80 rounded-full bg-marca/25 blur-3xl" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-36 left-1/4 h-72 w-72 rounded-full bg-laranja/10 blur-3xl" aria-hidden="true" />
            <div className="flex h-1.5" aria-hidden="true">
              <span className="w-16 bg-laranja" />
              <span className="flex-1 bg-marca" />
            </div>
            <div className="relative grid gap-6 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Receita mensal recorrente</p>
                <p className="mt-2 font-titulo text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl">{formatarMoeda(p.indicadores.receitaMensal)}</p>
                <p className="mt-1 text-sm text-white/60">das assinaturas em dia (já com os cupons)</p>
                <div className="mt-5 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 font-semibold ring-1 ring-white/15">
                    <TrendingUp className="h-3.5 w-3.5 text-marca" aria-hidden="true" /> {p.novasEmpresas30Dias} nova(s) em 30 dias
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 font-semibold ring-1 ring-white/15">
                    <Sparkles className="h-3.5 w-3.5 text-marca" aria-hidden="true" /> {p.conversoes30Dias} teste(s) viraram assinatura
                  </span>
                  {!p.pagamentoOnline && <span className="rounded-full bg-amber-400/15 px-3 py-1 font-semibold text-amber-200 ring-1 ring-amber-300/30">Pagamento online desligado (modo manual)</span>}
                </div>
              </div>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  ['Recebido neste mês', p.recebidoNoMes, 'text-white', 'cobranças pagas'],
                  ['Mensalidades em risco', p.indicadores.receitaEmRisco, 'text-amber-200', 'assinantes com atraso'],
                  ['Em atraso', p.emAtraso, 'text-red-200', 'cobranças vencidas'],
                ].map(([rotulo, valor, cor, sub]) => (
                  <div key={rotulo} className="min-w-0 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                    <dt className="text-xs text-white/60">{rotulo}</dt>
                    <dd className={cn('mt-1 truncate font-titulo text-2xl font-extrabold tabular-nums', cor)}>{formatarMoeda(valor)}</dd>
                    <dd className="text-xs text-white/45">{sub}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          {/* Empresas por situação */}
          <Secao
            titulo={`${p.indicadores.total} empresa(s)`}
            subtitulo="Por situação da assinatura. Clique para ver a lista."
            acoes={
              <Button asChild variant="ghost" size="sm">
                <Link to="/plataforma/empresas">
                  Todas as assinaturas <ArrowRight />
                </Link>
              </Button>
            }
          >
            <div className="mb-5 flex h-3 overflow-hidden rounded-full bg-fundo" aria-hidden="true">
              {CATEGORIAS.map((c) => (p.indicadores.porCategoria[c] ? <span key={c} className={PONTO_CATEGORIA[c]} style={{ width: `${(p.indicadores.porCategoria[c] / total) * 100}%` }} /> : null))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
              {CATEGORIAS.map((c) => (
                <Link
                  key={c}
                  to={`/plataforma/empresas?categoria=${c}`}
                  className={cn('group min-w-0 rounded-2xl p-4 ring-1 ring-border transition-all hover:-translate-y-0.5 hover:shadow-suave', p.indicadores.porCategoria[c] === 0 && 'opacity-60')}
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-texto-secundario">
                    <span className={cn('h-2.5 w-2.5 rounded-full', PONTO_CATEGORIA[c])} aria-hidden="true" />
                    <span className="truncate">{CATEGORIA_SINGULAR[c]}</span>
                  </span>
                  <span className="mt-2 block font-titulo text-3xl font-extrabold text-tinta">{p.indicadores.porCategoria[c]}</span>
                </Link>
              ))}
            </div>
          </Secao>

          <Secao titulo="Precisa de atenção" subtitulo={p.problemas.length ? `${p.problemas.length} item(ns), os mais graves primeiro.` : undefined} icone={AlertTriangle}>
            {p.problemas.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-marca-escuro">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Nenhum problema agora.
              </p>
            ) : (
              <ul className="space-y-2">
                {p.problemas.map((pr, i) => {
                  const g = GRAVIDADE[pr.gravidade]
                  return (
                    <li key={`${pr.tipo}-${pr.empresa?.id ?? pr.eventoId}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl p-3 text-sm ring-1 ring-border">
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', g.fundo)}>
                        <g.Icone className={cn('h-4 w-4', g.cor)} aria-label={`Gravidade ${g.rotulo}`} />
                      </span>
                      <div className="min-w-0 flex-1">
                        {pr.empresa ? (
                          <Link to={`/plataforma/empresas/${pr.empresa.id}`} className="font-semibold text-tinta hover:underline">
                            {pr.empresa.nome}
                          </Link>
                        ) : (
                          <span className="font-semibold text-tinta">Asaas</span>
                        )}
                        <p className="text-texto-secundario">{pr.descricao}</p>
                      </div>
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
          </Secao>
        </div>
      )}
    </>
  )
}
