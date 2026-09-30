import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Plug } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { EmptyState } from './EmptyState'

interface IntegracaoFuturaProps {
  titulo: string
  descricao: ReactNode
  icone?: LucideIcon
  acao?: ReactNode
}

/** Placeholder padrão para integrações externas que chegam na Fase 9. */
export function IntegracaoFutura({ titulo, descricao, icone = Plug, acao }: IntegracaoFuturaProps) {
  return (
    <Card>
      <EmptyState
        icone={icone}
        titulo={titulo}
        descricao={
          <>
            <span className="mb-3 inline-block rounded-full bg-ambar/15 px-3 py-1 text-xs font-medium text-amber-800">
              Integração futura
            </span>
            <p>{descricao}</p>
          </>
        }
        acao={acao}
      />
    </Card>
  )
}
