import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { LoginInput, TrocarSenhaInput, UsuarioLogado } from '@onprint/shared'
import { authApi } from '@/api/auth'
import { aoAssinaturaMudar, aoSessaoExpirar, renovarSessao, talvezHajaSessao } from '@/api/http'
import { definirEmpresaAtual } from '@/lib/empresaAtual'
import { AuthContext } from '../authContext'
import type { MarcaEmpresa } from '../types'

/** Avisa as outras abas que a sessão acabou */
const CHAVE_SAIDA = 'onprint:saida'

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

  // A situação da assinatura muda sem o usuário fazer nada (vencimento, pagamento, bloqueio):
  // atualiza ao voltar para a aba, a cada 10 minutos e quando a API recusar por causa dela
  const logado = Boolean(usuario)
  useEffect(() => {
    if (!logado) return
    const atualizar = () =>
      void authApi
        .me()
        .then(setUsuario)
        .catch(() => undefined)
    aoAssinaturaMudar(atualizar)
    const intervalo = window.setInterval(atualizar, 10 * 60_000)
    window.addEventListener('focus', atualizar)
    return () => {
      window.clearInterval(intervalo)
      window.removeEventListener('focus', atualizar)
    }
  }, [logado])

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
      try {
        localStorage.setItem(CHAVE_SAIDA, String(Date.now()))
      } catch {
        // sem armazenamento: as outras abas saem quando a sessão falhar
      }
    }
  }, [queryClient])

  // Saiu em outra aba (ou por inatividade): esta aba sai junto
  useEffect(() => {
    const aoMudar = (e: StorageEvent) => {
      if (e.key !== CHAVE_SAIDA) return
      setUsuario(null)
      queryClient.clear()
    }
    window.addEventListener('storage', aoMudar)
    return () => window.removeEventListener('storage', aoMudar)
  }, [queryClient])

  const trocarSenha = useCallback(async (dados: TrocarSenhaInput) => {
    const resposta = await authApi.trocarSenha(dados)
    setUsuario(resposta.usuario)
  }, [])

  const atualizarMarca = useCallback((marca: MarcaEmpresa) => {
    setUsuario((u) => (u ? { ...u, empresa: { ...u.empresa, ...marca } } : u))
  }, [])

  const definirModoTela = useCallback(async (modoTela: UsuarioLogado['modoTela']) => {
    let anterior: UsuarioLogado['modoTela'] | undefined
    setUsuario((u) => {
      anterior = u?.modoTela
      return u ? { ...u, modoTela } : u
    })
    try {
      await authApi.preferencias({ modoTela })
    } catch (erro) {
      // Não salvou: volta ao que estava
      if (anterior) setUsuario((u) => (u ? { ...u, modoTela: anterior as UsuarioLogado['modoTela'] } : u))
      throw erro
    }
  }, [])

  const valor = useMemo(
    () => ({ usuario, carregando, entrar, sair, trocarSenha, atualizarMarca, definirModoTela }),
    [usuario, carregando, entrar, sair, trocarSenha, atualizarMarca, definirModoTela],
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}
