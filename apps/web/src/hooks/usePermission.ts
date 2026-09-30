import { useCallback } from 'react'
import type { Acao, Modulo } from '@onprint/shared'
import { useAuth } from './useAuth'

/**
 * Consulta as permissões do usuário logado (vindas de /auth/me).
 * Serve só para esconder elementos: quem garante o acesso é a API.
 */
export function usePermissoes() {
  const { usuario } = useAuth()
  return useCallback(
    (modulo: Modulo, acao: Acao = 'visualizar') => Boolean(usuario?.permissoes.includes(`${modulo}:${acao}`)),
    [usuario],
  )
}

export function usePermission(modulo: Modulo, acao: Acao = 'visualizar'): boolean {
  return usePermissoes()(modulo, acao)
}
