import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icone: LucideIcon
  titulo: string
  descricao?: ReactNode
  acao?: ReactNode
  className?: string
}

export function EmptyState({ icone: Icone, titulo, descricao, acao, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-tinta">
        <Icone className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-tinta">{titulo}</h2>
      {descricao && <div className="mt-2 max-w-md text-sm text-texto-secundario">{descricao}</div>}
      {acao && <div className="mt-6">{acao}</div>}
    </div>
  )
}
