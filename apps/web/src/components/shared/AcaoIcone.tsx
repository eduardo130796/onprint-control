import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface AcaoIconeProps {
  icone: LucideIcon
  rotulo: string
  onClick: () => void
  perigo?: boolean
}

/** Botão de ação por ícone nas linhas das tabelas (com tooltip e rótulo acessível). */
export function AcaoIcone({ icone: Icone, rotulo, onClick, perigo }: AcaoIconeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8', perigo && 'text-coral-escuro hover:text-coral-escuro')}
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
          aria-label={rotulo}
        >
          <Icone />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{rotulo}</TooltipContent>
    </Tooltip>
  )
}
