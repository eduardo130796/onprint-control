import { AlertTriangle, ChevronsUp, Flame } from 'lucide-react'
import { PRIORIDADE_ROTULOS, type Prioridade } from '@onprint/shared'
import { cn } from '@/lib/utils'

const COR_PRIORIDADE: Record<Prioridade, string> = {
  baixa: 'bg-slate-100 text-slate-600',
  normal: 'bg-sky-50 text-sky-800',
  alta: 'bg-amber-50 text-amber-800',
  urgente: 'bg-coral/10 text-coral-escuro',
}

/** Selo de prioridade (só aparece para alta/urgente, a menos que `sempre`). */
export function SeloPrioridade({ prioridade, sempre }: { prioridade: Prioridade; sempre?: boolean }) {
  if (!sempre && (prioridade === 'normal' || prioridade === 'baixa')) return null
  const Icone = prioridade === 'urgente' ? Flame : ChevronsUp
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', COR_PRIORIDADE[prioridade])}>
      {(prioridade === 'alta' || prioridade === 'urgente') && <Icone className="h-3 w-3" />}
      {PRIORIDADE_ROTULOS[prioridade]}
    </span>
  )
}

/** Selo vermelho "Atrasado". */
export function SeloAtraso({ texto = 'Atrasado' }: { texto?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-coral-escuro px-2 py-0.5 text-xs font-medium text-white">
      <AlertTriangle className="h-3 w-3" /> {texto}
    </span>
  )
}
