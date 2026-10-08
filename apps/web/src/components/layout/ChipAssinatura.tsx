import { Link } from 'react-router-dom'
import { statusDaAssinatura, type TomStatus } from '@/features/assinatura/status'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

const TOM: Record<TomStatus, { ponto: string; chip: string }> = {
  verde: { ponto: 'bg-marca', chip: 'text-white/85 ring-white/15 hover:bg-white/10' },
  azul: { ponto: 'bg-sky-400', chip: 'text-sky-100 ring-sky-300/30 hover:bg-sky-400/10' },
  violeta: { ponto: 'bg-violet-400', chip: 'text-violet-100 ring-violet-300/30 hover:bg-violet-400/10' },
  ambar: { ponto: 'bg-amber-400 animate-pulse', chip: 'bg-amber-400/15 text-amber-100 ring-amber-300/40 hover:bg-amber-400/25' },
  coral: { ponto: 'bg-coral animate-pulse', chip: 'bg-coral/20 text-red-100 ring-coral/50 hover:bg-coral/30' },
  vermelho: { ponto: 'bg-red-500', chip: 'bg-red-500/20 text-red-100 ring-red-400/50 hover:bg-red-500/30' },
  cinza: { ponto: 'bg-white/50', chip: 'text-white/70 ring-white/15 hover:bg-white/10' },
}

/** Situação da assinatura sempre à vista no topo (plano + situação); leva a "Minha assinatura". */
export function ChipAssinatura() {
  const { usuario } = useAuth()
  const a = usuario?.assinatura
  if (!a) return null
  const s = statusDaAssinatura(a)
  const t = TOM[s.tom]
  return (
    <Link
      to="/assinatura"
      title={`${a.plano} · ${s.rotulo}. ${a.mensagem}`}
      aria-label={`Assinatura: plano ${a.plano}, ${s.rotulo}`}
      className={cn('inline-flex h-9 max-w-[17rem] items-center gap-2 rounded-full px-2.5 text-xs font-semibold ring-1 transition-colors sm:px-3', t.chip)}
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', t.ponto)} aria-hidden="true" />
      <span className="hidden truncate md:inline">
        <span className="text-white/55">{a.plano} · </span>
        {s.curto}
      </span>
      <span className="hidden truncate sm:inline md:hidden">{s.tom === 'verde' ? a.plano : s.curto}</span>
    </Link>
  )
}
