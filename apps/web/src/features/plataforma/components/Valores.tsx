import { Crown, TicketPercent, Unlock } from 'lucide-react'
import { formatarMoeda, type EmpresaPlataformaResumo } from '@onprint/shared'
import { cn } from '@/lib/utils'
import { COR_BENEFICIO, FORMA_CURTA } from './cores'

export function FormaPagamento({ forma, className }: { forma: string | null; className?: string }) {
  const f = forma ? FORMA_CURTA[forma] : undefined
  if (!f) return <span className={cn('text-texto-secundario', className)}>Manual</span>
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <f.Icone className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" /> {f.rotulo}
    </span>
  )
}

const ICONE_BENEFICIO = { cupom: TicketPercent, cortesia: Crown, liberacao: Unlock } as const

export function ChipBeneficio({ beneficio }: { beneficio: EmpresaPlataformaResumo['beneficio'] }) {
  if (!beneficio) return <span className="text-texto-secundario">—</span>
  const Icone = ICONE_BENEFICIO[beneficio.tipo]
  return (
    <span className={cn('inline-flex max-w-[10rem] items-center gap-1 truncate rounded-full px-2 py-0.5 text-xs font-semibold ring-1', COR_BENEFICIO[beneficio.tipo])} title={beneficio.rotulo}>
      <Icone className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{beneficio.rotulo}</span>
    </span>
  )
}

/** Mensalidade cobrada; com cupom mostra a cheia riscada. */
export function ValorCobrado({ e, claro, empilhado }: { e: Pick<EmpresaPlataformaResumo, 'valorCobrado' | 'valorMensal' | 'situacao'>; claro?: boolean; empilhado?: boolean }) {
  if (!e.valorMensal) return <span className="text-texto-secundario">—</span>
  const cobrado = e.valorCobrado ?? e.valorMensal
  const comDesconto = Number(cobrado) < Number(e.valorMensal)
  return (
    <span className="whitespace-nowrap">
      <span className={cn('font-semibold tabular-nums', claro ? 'text-white' : 'text-tinta')}>{e.situacao === 'cortesia' ? 'Grátis' : formatarMoeda(cobrado)}</span>
      {comDesconto && <span className={cn('text-xs tabular-nums line-through', empilhado ? 'block' : 'ml-1.5', claro ? 'text-white/50' : 'text-texto-secundario')}>{formatarMoeda(e.valorMensal)}</span>}
    </span>
  )
}
