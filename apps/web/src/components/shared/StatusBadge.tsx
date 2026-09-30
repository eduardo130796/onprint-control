import type { EntidadeStatus } from '@onprint/shared'
import { useStatusConfig } from '@/hooks/useStatusConfig'
import { fundoSuave, textoLegivel } from '@/lib/contraste'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  entidade: EntidadeStatus
  codigo: string
  className?: string
}

/** Badge único do sistema: cor e rótulo vêm da tabela status_config (texto escurecido até o contraste AA). */
export function StatusBadge({ entidade, codigo, className }: StatusBadgeProps) {
  const { mapa } = useStatusConfig()
  const status = mapa.get(`${entidade}:${codigo}`)
  const cor = status?.cor ?? '#6B7280'
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', className)}
      style={{ backgroundColor: fundoSuave(cor), color: textoLegivel(cor) }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cor }} />
      {status?.rotulo ?? codigo}
    </span>
  )
}
