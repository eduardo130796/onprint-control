import { useId, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import type { KpiDashboard } from '@onprint/shared'
import { cn } from '@/lib/utils'

export type TomIndicador = 'neutro' | 'marca' | 'positivo' | 'negativo' | 'alerta'

const TONS: Record<TomIndicador, { icone: string; valor: string }> = {
  neutro: { icone: 'bg-fundo text-tinta/70', valor: 'text-tinta' },
  marca: { icone: 'bg-marca-suave text-marca-escuro', valor: 'text-tinta' },
  positivo: { icone: 'bg-green-50 text-green-700', valor: 'text-green-700' },
  negativo: { icone: 'bg-coral/10 text-coral-escuro', valor: 'text-coral-escuro' },
  alerta: { icone: 'bg-amber-50 text-amber-700', valor: 'text-amber-700' },
}

interface CartaoIndicadorProps {
  rotulo: string
  /** Valor já formatado */
  valor: ReactNode
  icone?: LucideIcon
  tom?: TomIndicador
  /** Linha de apoio embaixo do valor (quando não há variação) */
  detalhe?: ReactNode
  variacao?: KpiDashboard['variacao']
  /** Pontos do minigráfico de tendência */
  serie?: number[]
  link?: string
  /** Valor menor (grades com muitas colunas) */
  compacto?: boolean
  /** Cartão principal: ocupa duas colunas e o minigráfico fica maior */
  destaque?: boolean
  className?: string
}

/** Minigráfico de linha com área suave, na cor da marca */
export function MiniTendencia({ pontos, className }: { pontos: number[]; className?: string }) {
  const id = useId()
  if (pontos.length < 2) return null
  const L = 120
  const A = 36
  const max = Math.max(...pontos)
  const min = Math.min(...pontos)
  const faixa = max - min || 1
  const xy = pontos.map((v, i) => [(i / (pontos.length - 1)) * L, A - 3 - ((v - min) / faixa) * (A - 6)] as const)
  const linha = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const ultimo = xy[xy.length - 1]!
  return (
    <svg viewBox={`0 0 ${L} ${A}`} className={cn('h-9 w-28 overflow-visible', className)} aria-hidden="true" preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--marca))" stopOpacity="0.28" />
          <stop offset="100%" stopColor="rgb(var(--marca))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${linha} L${L},${A} L0,${A} Z`} fill={`url(#${id})`} />
      <path d={linha} fill="none" stroke="rgb(var(--marca))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={ultimo[0]} cy={ultimo[1]} r="2.5" fill="rgb(var(--marca))" />
    </svg>
  )
}

/** Selo de variação: ↑ verde / ↓ coral, em % ou pontos percentuais */
export function SeloVariacao({ variacao }: { variacao: NonNullable<KpiDashboard['variacao']> }) {
  const sobe = variacao.valor > 0
  const neutro = variacao.valor === 0
  const Icone = sobe ? TrendingUp : TrendingDown
  const numero = `${sobe ? '+' : ''}${variacao.valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${variacao.unidade === 'pontos' ? ' p.p.' : '%'}`
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold',
          neutro ? 'bg-fundo text-texto-secundario' : sobe ? 'bg-green-50 text-green-700' : 'bg-coral/10 text-coral-escuro',
        )}
      >
        {!neutro && <Icone className="h-3 w-3" aria-hidden="true" />}
        {numero}
      </span>
      <span className="text-texto-secundario">vs. {variacao.contra}</span>
    </span>
  )
}

/**
 * Cartão de indicador (número em destaque): ícone, rótulo, valor com algarismos alinhados, variação contra o
 * período anterior e minigráfico de tendência. Com link, o cartão inteiro abre a tela de detalhe.
 */
export function CartaoIndicador({ rotulo, valor, icone: Icone, tom = 'neutro', detalhe, variacao, serie, link, compacto, destaque, className }: CartaoIndicadorProps) {
  const t = TONS[tom]
  const conteudo = (
    <div
      className={cn(
        'group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 sm:p-5',
        destaque && !link && 'col-span-2',
        link && 'hover:-translate-y-0.5 hover:border-border hover:shadow-[0_8px_24px_-12px_rgba(16,24,40,0.18)]',
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        {Icone && (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', t.icone)}>
            <Icone className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
        <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-texto-secundario">{rotulo}</p>
      </div>
      {link && <ArrowUpRight className="absolute right-3 top-3 h-4 w-4 text-texto-secundario opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />}
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className={cn('min-w-0 truncate font-semibold leading-tight tracking-tight', compacto ? 'text-xl' : destaque ? 'text-[26px] sm:text-[32px]' : 'text-xl sm:text-[26px]', t.valor)}>{valor}</p>
        {serie && <MiniTendencia pontos={serie} className={cn('mb-1 h-8 w-20 shrink-0 sm:h-9 sm:w-28', destaque && 'sm:h-12 sm:w-44')} />}
      </div>
      {(variacao || detalhe) && <div className="mt-2 min-h-5 text-xs text-texto-secundario">{variacao ? <SeloVariacao variacao={variacao} /> : detalhe}</div>}
    </div>
  )
  return link ? (
    <Link to={link} className={cn('block min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', destaque && 'col-span-2')}>
      {conteudo}
    </Link>
  ) : (
    conteudo
  )
}
