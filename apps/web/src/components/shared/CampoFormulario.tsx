import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

interface CampoFormularioProps {
  id: string
  rotulo: string
  erro?: string
  acao?: ReactNode
  /** Texto curto de ajuda abaixo do campo */
  dica?: ReactNode
  children: ReactNode
}

/** Rótulo + campo + mensagem de erro, no padrão de todos os formulários. */
export function CampoFormulario({ id, rotulo, erro, acao, dica, children }: CampoFormularioProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{rotulo}</Label>
        {acao}
      </div>
      {children}
      {dica && !erro && <p className="text-xs text-texto-secundario">{dica}</p>}
      {erro && (
        <p id={`${id}-erro`} role="alert" className="text-xs text-coral-escuro">
          {erro}
        </p>
      )}
    </div>
  )
}
