import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { LoginInput, TrocarSenhaInput, UsuarioLogado } from '@onprint/shared'
import { authApi } from '@/api/auth'
import { aoSessaoExpirar, renovarSessao, talvezHajaSessao } from '@/api/http'
import { definirEmpresaAtual } from '@/lib/empresaAtual'
import { AuthContext } from '../authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null)
  const [carregando, setCarregando] = useState(true)
  definirEmpresaAtual(usuario?.empresa.slug ?? '')

  // Ao abrir o app, tenta recuperar a sessão pelo cookie de refresh
  useEffect(() => {
    let ativo = true
    const recuperar = talvezHajaSessao() ? renovarSessao() : Promise.resolve(null)
    recuperar.then((resposta) => {
      if (!ativo) return
      setUsuario(resposta?.usuario ?? null)
      setCarregando(false)
    })
    aoSessaoExpirar(() => {
      setUsuario(null)
      queryClient.clear()
    })
    return () => {
      ativo = false
    }
  }, [queryClient])

  const entrar = useCallback(async (dados: LoginInput) => {
    const resposta = await authApi.login(dados)
    setUsuario(resposta.usuario)
    return resposta.usuario
  }, [])

  const sair = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setUsuario(null)
      queryClient.clear()
    }
  }, [queryClient])

  const trocarSenha = useCallback(async (dados: TrocarSenhaInput) => {
    const resposta = await authApi.trocarSenha(dados)
    setUsuario(resposta.usuario)
  }, [])

  const valor = useMemo(
    () => ({ usuario, carregando, entrar, sair, trocarSenha }),
    [usuario, carregando, entrar, sair, trocarSenha],
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}
