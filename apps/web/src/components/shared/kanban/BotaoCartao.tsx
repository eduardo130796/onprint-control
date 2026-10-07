import type { LucideIcon } from 'lucide-react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BotaoCartaoProps {
  icone: LucideIcon
  rotulo: string
  onClick: () => void
  carregando?: boolean
  disabled?: boolean
  className?: string
}

/**
 * Botão de atalho dentro de um cartão arrastável do kanban: o clique (ou Enter/Espaço)
 * não inicia o arraste do cartão.
 */
export function BotaoCartao({ icone: Icone, rotulo, onClick, carregando, disabled, className }: BotaoCartaoProps) {
  return (
    <button
      type="button"
      title={rotulo}
      aria-label={rotulo}
      disabled={disabled || carregando}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-texto-secundario transition-colors hover:bg-fundo hover:text-petroleo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-turquesa disabled:opacity-50',
        className,
      )}
    >
      {carregando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icone className="h-3.5 w-3.5" />}
      {rotulo}
    </button>
  )
}
