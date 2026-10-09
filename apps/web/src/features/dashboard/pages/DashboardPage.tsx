import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CalendarClock } from 'lucide-react'
import { formatarDataSimples, type KpiDashboard, type PedidoResumoDashboard } from '@onprint/shared'
import { dashboardApi } from '@/api/relatorios'
import { PageHeader } from '@/components/layout/PageHeader'
import { EstadoErro } from '@/components/shared/EstadoErro'
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

function CartaoKpi({ k }: { k: KpiDashboard }) {
  const conteudo = (
    <Card className={cn('h-full p-4 transition hover:shadow-md', k.alerta && 'ring-1 ring-coral/40')}>
      <p className="text-xs text-texto-secundario">{k.rotulo}</p>
      <p className={cn('mt-1 text-2xl font-semibold', k.alerta ? 'text-coral-escuro' : 'text-tinta')}>{formatarValor(k.valor, k.formato)}</p>
      {k.detalhe && <p className="text-xs text-texto-secundario">{k.detalhe}</p>}
    </Card>
  )
  return k.link ? <Link to={k.link}>{conteudo}</Link> : conteudo
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

function ListaPedidos({ pedidos, vazio, atraso }: { pedidos: PedidoResumoDashboard[]; vazio: string; atraso?: boolean }) {
  if (pedidos.length === 0) return <p className="py-4 text-sm text-texto-secundario">{vazio}</p>
  return (
    <ul className="divide-y divide-border text-sm">
      {pedidos.map((p) => (
        <li key={p.id}>
          <Link to={`/pedidos/${p.id}`} className="flex items-center gap-2 py-2 hover:bg-fundo/60">
            <span className="font-mono text-xs">{p.numero}</span>
            <span className="min-w-0 flex-1 truncate">{p.cliente}</span>
            <StatusBadge entidade="pedido" codigo={p.status} className="text-[11px]" />
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
  const d = consulta.data
  const primeiroNome = usuario?.nome.split(' ')[0] ?? ''
  const rotuloStatus = (entidade: string) => (r: Record<string, string | number | null>) => ({
    ...r,
    nome: mapa.get(`${entidade}:${String(r.status ?? r.etapa)}`)?.rotulo ?? String(r.status ?? r.etapa),
    cor: mapa.get(`${entidade}:${String(r.status ?? r.etapa)}`)?.cor ?? null,
  })

  return (
    <>
      <PageHeader titulo={`Olá, ${primeiroNome}!`} subtitulo={<span className="first-letter:uppercase">{formatarDataExtenso(new Date())}</span>} />
      {consulta.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : consulta.isError || !d ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {d.kpis.map((k) => (
              <CartaoKpi key={k.chave} k={k} />
            ))}
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
          {(d.proximasEntregas || d.atrasos) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {d.proximasEntregas && (
                <Bloco titulo="Próximas entregas (7 dias)">
                  <ListaPedidos pedidos={d.proximasEntregas} vazio="Nada previsto para os próximos dias." />
                </Bloco>
              )}
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
