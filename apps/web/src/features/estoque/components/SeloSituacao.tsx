import { SITUACAO_ESTOQUE_ROTULOS, type SituacaoEstoque } from '@onprint/shared'
import { cn } from '@/lib/utils'

const COR: Record<SituacaoEstoque, string> = {
  ok: 'bg-verde/10 text-green-800',
  baixo: 'bg-ambar/15 text-amber-800',
  zerado: 'bg-coral/10 text-coral-escuro',
}

export function SeloSituacao({ situacao }: { situacao: SituacaoEstoque }) {
  return <span className={cn('whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', COR[situacao])}>{SITUACAO_ESTOQUE_ROTULOS[situacao]}</span>
}
