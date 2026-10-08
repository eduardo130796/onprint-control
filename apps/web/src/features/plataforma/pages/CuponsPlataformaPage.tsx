import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, Pause, Pencil, Play, Plus, TicketPercent } from 'lucide-react'
import { formatarDataSimples, formatarMoeda, type CupomPlataforma } from '@onprint/shared'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { plataformaApi } from '../api'
import { CodigoCupom, CupomDialog, SeloCupom } from '../components/CupomDialog'
import { useAlternarCupom } from '../components/acoes'
import { situacaoCupom } from '../components/regras'
import { CabecalhoPlataforma, Secao } from '../components/Secao'

function Numero({ rotulo, children, cor }: { rotulo: string; children: React.ReactNode; cor?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-secundario">{rotulo}</p>
      <p className={cn('truncate font-titulo text-lg font-extrabold tabular-nums text-grafite', cor)}>{children}</p>
    </div>
  )
}

function CartaoCupom({ c, onEditar }: { c: CupomPlataforma; onEditar: () => void }) {
  const alternar = useAlternarCupom()
  const situacao = situacaoCupom(c)
  const usoPct = c.limiteUsos ? Math.min(100, Math.round((c.usos / c.limiteUsos) * 100)) : null
  return (
    <article className={cn('flex min-w-0 flex-col overflow-hidden rounded-3xl bg-card shadow-suave', situacao !== 'ativo' && 'opacity-80')}>
      {/* Topo em forma de ingresso */}
      <div className="relative overflow-hidden bg-grafite px-5 pb-5 pt-4 text-white">
        <div className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full bg-laranja/25 blur-2xl" aria-hidden="true" />
        <div className="relative flex items-center justify-between gap-2">
          <CodigoCupom codigo={c.codigo} claro />
          <SeloCupom situacao={situacao} />
        </div>
        <p className="relative mt-1 font-titulo text-xl font-extrabold leading-tight">{c.resumo}</p>
        {c.descricao && <p className="relative mt-1 truncate text-sm text-white/60">{c.descricao}</p>}
        {/* Picote */}
        <span className="absolute -bottom-3 -left-3 h-6 w-6 rounded-full bg-fundo" aria-hidden="true" />
        <span className="absolute -bottom-3 -right-3 h-6 w-6 rounded-full bg-fundo" aria-hidden="true" />
      </div>
      <div className="flex flex-1 flex-col gap-4 border-t-2 border-dashed border-border p-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Numero rotulo="Usos">
            {c.usos}
            {c.limiteUsos != null && <span className="text-sm font-semibold text-texto-secundario"> / {c.limiteUsos}</span>}
          </Numero>
          <Numero rotulo="Em uso agora" cor="text-marca-escuro">
            {c.emUso}
          </Numero>
          <Numero rotulo="Desconto concedido" cor="text-laranja-escuro">
            {formatarMoeda(c.descontoConcedido)}
          </Numero>
          <Numero rotulo="Receita com o cupom">{formatarMoeda(c.receita)}</Numero>
        </div>
        {usoPct != null && (
          <div className="h-1.5 overflow-hidden rounded-full bg-fundo" aria-label={`${usoPct}% do limite usado`}>
            <div className={cn('h-full rounded-full', usoPct >= 100 ? 'bg-coral' : 'bg-laranja')} style={{ width: `${usoPct}%` }} />
          </div>
        )}
        <p className="text-xs text-texto-secundario">
          {c.planos.length ? `Planos: ${c.planos.join(', ')}` : 'Todos os planos'}
          {c.validoAte ? ` · válido até ${formatarDataSimples(c.validoAte)}` : ' · sem validade'}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button size="sm" variant="outline" onClick={onEditar}>
            <Pencil /> Editar
          </Button>
          <Button size="sm" variant="ghost" disabled={alternar.isPending} onClick={() => alternar.mutate(c)}>
            {c.ativo ? <Pause /> : <Play />} {c.ativo ? 'Pausar' : 'Reativar'}
          </Button>
          <Button asChild size="sm" variant="ghost" className="ml-auto">
            <Link to={`/plataforma/cupons/${c.id}`}>
              Empresas <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  )
}

/** Cupons de desconto: criar, pausar e acompanhar quanto renderam (e quanto custaram). */
export function CuponsPlataformaPage() {
  const consulta = useQuery({ queryKey: ['plataforma', 'cupons'], queryFn: plataformaApi.cupons })
  const [editando, setEditando] = useState<CupomPlataforma | null | 'novo'>(null)
  const lista = consulta.data ?? []
  const soma = (f: (c: CupomPlataforma) => number) => lista.reduce((t, c) => t + f(c), 0)

  return (
    <>
      <CabecalhoPlataforma
        sobretitulo="Benefícios"
        titulo="Cupons"
        subtitulo="Descontos para campanhas e parceiros. O cliente digita no cadastro ou o suporte aplica na ficha da empresa."
        acoes={
          <Button onClick={() => setEditando('novo')}>
            <Plus /> Novo cupom
          </Button>
        }
      />
      {consulta.isPending ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-80 rounded-3xl" />
          ))}
        </div>
      ) : consulta.isError ? (
        <Secao>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Secao>
      ) : lista.length === 0 ? (
        <Secao>
          <EmptyState
            icone={TicketPercent}
            titulo="Nenhum cupom ainda"
            descricao="Crie um cupom (ex.: 20% por 3 meses) para campanhas, indicações ou parceiros."
            acao={
              <Button onClick={() => setEditando('novo')}>
                <Plus /> Criar o primeiro cupom
              </Button>
            }
          />
        </Secao>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['Cupons ativos', String(lista.filter((c) => situacaoCupom(c) === 'ativo').length), 'text-grafite'],
              ['Empresas com desconto agora', String(soma((c) => c.emUso)), 'text-marca-escuro'],
              ['Desconto concedido', formatarMoeda(soma((c) => Number(c.descontoConcedido))), 'text-laranja-escuro'],
              ['Receita com cupom', formatarMoeda(soma((c) => Number(c.receita))), 'text-grafite'],
            ].map(([rotulo, valor, cor]) => (
              <div key={rotulo} className="min-w-0 rounded-2xl bg-card p-4 shadow-suave">
                <p className="text-xs text-texto-secundario">{rotulo}</p>
                <p className={cn('truncate font-titulo text-2xl font-extrabold tabular-nums', cor)}>{valor}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {lista.map((c) => (
              <CartaoCupom key={c.id} c={c} onEditar={() => setEditando(c)} />
            ))}
          </div>
        </>
      )}
      {editando && <CupomDialog cupom={editando === 'novo' ? null : editando} onFechar={() => setEditando(null)} />}
    </>
  )
}
