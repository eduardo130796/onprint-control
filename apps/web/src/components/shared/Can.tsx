import type { ReactNode } from 'react'
import type { Acao, Modulo } from '@onprint/shared'
import { usePermission } from '@/hooks/usePermission'

interface CanProps {
  modulo: Modulo
  acao?: Acao
  children: ReactNode
  /** Renderizado quando o usuário não tem a permissão. */
  senao?: ReactNode
}

/** Mostra o conteúdo só para quem tem a permissão. A API continua validando tudo. */
export function Can({ modulo, acao = 'visualizar', children, senao = null }: CanProps) {
  return <>{usePermission(modulo, acao) ? children : senao}</>
}
