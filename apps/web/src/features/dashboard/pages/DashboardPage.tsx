import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlarmClock,
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  CircleDollarSign,
  Factory,
  FileText,
  HandCoins,
  Hourglass,
  Inbox,
  PackageX,
  Plus,
  Receipt,
  ShoppingCart,
  Tags,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { formatarDataSimples, type KpiDashboard, type PedidoResumoDashboard } from '@onprint/shared'
import { montarAreas } from '@/app/navigation'
import { dashboardApi } from '@/api/relatorios'
import { CartaoIndicador, type TomIndicador } from '@/components/shared/CartaoIndicador'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { useContagemReajuste } from '@/features/produtos/hooks'
import { usePermissoes } from '@/hooks/usePermission'
import { BarrasHorizontais, BarrasVerticais } from '@/components/shared/graficos/Barras'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useStatusConfig } from '@/hooks/useStatusConfig'
import { formatarDataExtenso } from '@/lib/datas'
import { formatarValor } from '@/lib/formatoValor'
import { cn } from '@/lib/utils'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const rotuloMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`

/** Ícone e tom de cada indicador do dashboard */
const VISUAL: Record<string, { icone: LucideIcon; tom?: TomIndicador }> = {
  faturamento_mes: { icone: CircleDollarSign, tom: 'marca' },
  pedidos_mes: { icone: ShoppingCart, tom: 'marca' },
  ticket_medio: { icone: Receipt, tom: 'marca' },
  pedidos_producao: { icone: Factory },
  orcamentos_abertos: { icone: FileText },
  conversao: { icone: Target },
  receber_hoje: { icone: HandCoins },
  pagar_hoje: { icone: Wallet },
  pedidos_atrasados: { icone: AlarmClock },
  receber_vencido: { icone: AlertTriangle },
  solicitacoes_novas: { icone: Inbox },
  orcamentos_vencendo: { icone: Hourglass },
  estoque_baixo: { icone: PackageX },
}

function saudacao() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

/** Topo do início: saudação, data e os atalhos de criação mais usados */
function Cabecalho({ nome }: { nome: string }) {
  const pode = usePermissoes()
  const acoes = useMemo(() => montarAreas((m, a) => pode(m, a)).find((a) => a.area === 'inicio')?.acoes.slice(0, 3) ?? [], [pode])
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-medium text-texto-secundario first-letter:uppercase">{formatarDataExtenso(new Date())}</p>
        <h1 className="mt-1 font-titulo text-[28px] font-extrabold leading-tight tracking-tight text-tinta">
          {saudacao()}, {nome}
        </h1>
      </div>
      {acoes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {acoes.map((a, i) => (
            <Button key={a.path} asChild variant={i === 0 ? 'default' : 'outline'} size="sm">
              <Link to={a.path}>
                <Plus /> {a.titulo}
              </Link>
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

/** "Precisa da sua atenção": pendências com número > 0 (atrasos, vencidos, estoque baixo…) ou "tudo em dia" */
function Atencao({ itens, reajuste }: { itens: KpiDashboard[]; reajuste: number }) {
  const pendentes = [
    ...itens.filter((k) => k.valor > 0),
    ...(reajuste > 0 ? [{ chave: 'reajuste', rotulo: 'Produtos com preço a revisar', valor: reajuste, formato: 'numero', link: '/produtos/reajuste', grupo: 'atencao' } satisfies KpiDashboard] : []),
  ]
  return (
    <section className="flex h-full flex-col rounded-2xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-5" aria-label="Precisa da sua atenção">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-tinta">Precisa da sua atenção</h2>
        {pendentes.length > 0 && <span className="rounded-full bg-laranja-escuro px-2 text-[11px] font-bold leading-5 text-white tabular-nums">{pendentes.length}</span>}
      </div>
      {pendentes.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-green-50 text-green-700">
            <CircleCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold text-tinta">Tudo em dia</p>
          <p className="text-xs text-texto-secundario">Nenhum atraso ou pendência agora.</p>
        </div>
      ) : (
        <ul className="-mx-2 mt-2 flex flex-col">
          {pendentes.map((k) => {
            const Icone = VISUAL[k.chave]?.icone ?? (k.chave === 'reajuste' ? Tags : AlertTriangle)
            const grave = k.chave === 'pedidos_atrasados' || k.chave === 'receber_vencido'
            return (
              <li key={k.chave}>
                <Link to={k.link ?? '/'} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-fundo">
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', grave ? 'bg-coral/10 text-coral-escuro' : 'bg-amber-50 text-amber-700')}>
                    <Icone className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-tinta">{k.rotulo}</span>
                  <span className={cn('text-sm font-semibold tabular-nums', grave ? 'text-coral-escuro' : 'text-tinta')}>{formatarValor(k.valor, k.formato)}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-texto-secundario/60 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Bloco({ titulo, children, className }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('min-w-0', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function ListaPedidos({ pedidos, vazio, atraso, compacta }: { pedidos: PedidoResumoDashboard[]; vazio: string; atraso?: boolean; compacta?: boolean }) {
  if (pedidos.length === 0) return <p className="py-4 text-sm text-texto-secundario">{vazio}</p>
  return (
    <ul className="divide-y divide-border text-sm">
      {pedidos.map((p) => (
        <li key={p.id}>
          <Link to={`/pedidos/${p.id}`} className="flex items-center gap-2 py-2 hover:bg-fundo/60">
            <span className="font-mono text-xs">{p.numero}</span>
            <span className="min-w-0 flex-1 truncate">{p.cliente}</span>
            {!compacta && <StatusBadge entidade="pedido" codigo={p.status} className="text-[11px]" />}
            <span className={cn('w-20 text-right text-xs', atraso ? 'font-medium text-coral-escuro' : 'text-texto-secundario')}>{formatarDataSimples(p.data)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Dashboard (seção 11): KPIs, gráficos e listas, com dados reais agregados no banco. */
export function DashboardPage() {
  const { usuario } = useAuth()
  const { mapa } = useStatusConfig()
  const consulta = useQuery({ queryKey: ['dashboard'], queryFn: dashboardApi.obter, refetchInterval: 5 * 60 * 1000 })
  const reajuste = useContagemReajuste()
  const d = consulta.data
  const indicadores = d?.kpis.filter((k) => k.grupo !== 'atencao') ?? []
  const atencao = d?.kpis.filter((k) => k.grupo === 'atencao') ?? []
  const primeiroNome = usuario?.nome.split(' ')[0] ?? ''
  const rotuloStatus = (entidade: string) => (r: Record<string, string | number | null>) => ({
    ...r,
    nome: mapa.get(`${entidade}:${String(r.status ?? r.etapa)}`)?.rotulo ?? String(r.status ?? r.etapa),
    cor: mapa.get(`${entidade}:${String(r.status ?? r.etapa)}`)?.cor ?? null,
  })

  return (
    <>
      <Cabecalho nome={primeiroNome} />
      {consulta.isPending ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[132px] rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl lg:h-auto" />
        </div>
      ) : consulta.isError || !d ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className={cn('grid gap-4', (atencao.length > 0 || d.proximasEntregas) && 'lg:grid-cols-3')}>
            {indicadores.length > 0 && (
              <div className={cn('grid min-w-0 grid-cols-2 content-start gap-3 sm:gap-4', atencao.length > 0 || d.proximasEntregas ? 'lg:col-span-2 xl:grid-cols-3' : 'lg:grid-cols-3 xl:grid-cols-4')}>
                {indicadores.map((k) => (
                  <CartaoIndicador
                    key={k.chave}
                    rotulo={k.rotulo}
                    valor={formatarValor(k.valor, k.formato)}
                    icone={VISUAL[k.chave]?.icone}
                    tom={VISUAL[k.chave]?.tom}
                    detalhe={k.detalhe}
                    variacao={k.variacao}
                    serie={k.serie}
                    link={k.link}
                    destaque={k.chave === 'faturamento_mes'}
                  />
                ))}
              </div>
            )}
            {(atencao.length > 0 || d.proximasEntregas) && (
              <div className="order-first flex min-w-0 flex-col gap-4 lg:order-none">
                {atencao.length > 0 && <Atencao itens={atencao} reajuste={reajuste.data ?? 0} />}
                {d.proximasEntregas && (
                  <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-5" aria-label="Próximas entregas">
                    <h2 className="text-sm font-semibold text-tinta">Próximas entregas (7 dias)</h2>
                    <ListaPedidos pedidos={d.proximasEntregas} vazio="Nada previsto para os próximos dias." compacta />
                  </section>
                )}
              </div>
            )}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {d.faturamentoMensal && (
              <Bloco titulo="Faturamento mensal" className="lg:col-span-2">
                <BarrasVerticais
                  dados={d.faturamentoMensal}
                  rotulo="mes"
                  formatarRotulo={rotuloMes}
                  series={[{ chave: 'pedidos', titulo: 'Pedidos' }, { chave: 'balcao', titulo: 'Balcão' }]}
                  formato="moeda"
                />
              </Bloco>
            )}
            {d.funil && (
              <Bloco titulo="Funil de orçamentos (90 dias)">
                <BarrasHorizontais dados={d.funil} rotulo="etapa" series={[{ chave: 'quantidade', titulo: 'Orçamentos' }]} formato="numero" />
              </Bloco>
            )}
            {d.pedidosPorStatus && (
              <Bloco titulo="Pedidos por status">
                {d.pedidosPorStatus.length ? (
                  <BarrasHorizontais dados={d.pedidosPorStatus.map(rotuloStatus('pedido'))} rotulo="nome" series={[{ chave: 'quantidade', titulo: 'Pedidos' }]} formato="numero" cores={(r) => (r.cor as string) ?? undefined} />
                ) : (
                  <p className="text-sm text-texto-secundario">Nenhum pedido em andamento.</p>
                )}
              </Bloco>
            )}
            {d.producaoPorEtapa && (
              <Bloco titulo="Produção por etapa">
                {d.producaoPorEtapa.length ? (
                  <BarrasHorizontais dados={d.producaoPorEtapa.map(rotuloStatus('producao'))} rotulo="nome" series={[{ chave: 'quantidade', titulo: 'OPs' }]} formato="numero" cores={(r) => (r.cor as string) ?? undefined} />
                ) : (
                  <p className="text-sm text-texto-secundario">Nenhuma OP em aberto.</p>
                )}
              </Bloco>
            )}
            {d.topProdutos && (
              <Bloco titulo="Top produtos (90 dias)">
                {d.topProdutos.length ? (
                  <BarrasHorizontais dados={d.topProdutos} rotulo="produto" series={[{ chave: 'total', titulo: 'Vendido' }]} formato="moeda" />
                ) : (
                  <p className="text-sm text-texto-secundario">Sem vendas no período.</p>
                )}
              </Bloco>
            )}
          </div>
          {d.atrasos && d.atrasos.length > 0 && (
            <div className="grid gap-4">
              {d.atrasos && (
                <Card className="min-w-0">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      {d.atrasos.length ? <AlertTriangle className="h-4 w-4 text-coral-escuro" /> : <CalendarClock className="h-4 w-4 text-marca-escuro" />} Atrasos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ListaPedidos pedidos={d.atrasos} vazio="Nenhum pedido atrasado." atraso />
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
