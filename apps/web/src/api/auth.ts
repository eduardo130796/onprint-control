import type { LinkSenhaInfo, LoginInput, PreferenciasInput, RespostaLogin, TrocarSenhaInput, UsuarioLogado } from '@onprint/shared'
import { definirAccessToken, http } from './http'

export const authApi = {
  async login(dados: LoginInput) {
    const resposta = await http<RespostaLogin>('/auth/login', { method: 'POST', body: dados, autenticado: false })
    definirAccessToken(resposta.accessToken)
    return resposta
  },

  async logout() {
    try {
      await http<void>('/auth/logout', { method: 'POST', autenticado: false })
    } finally {
      definirAccessToken(null)
    }
  },

  me() {
    return http<UsuarioLogado>('/auth/me')
  },

  esqueciSenha(email: string) {
    return http<{ mensagem: string }>('/auth/esqueci-senha', { method: 'POST', body: { email }, autenticado: false })
  },

  consultarLinkSenha(token: string) {
    return http<LinkSenhaInfo>(`/auth/redefinir-senha/${encodeURIComponent(token)}`, { autenticado: false })
  },

  redefinirSenha(token: string, novaSenha: string) {
    return http<void>('/auth/redefinir-senha', { method: 'POST', body: { token, novaSenha }, autenticado: false })
  },

  preferencias(dados: PreferenciasInput) {
    return http<PreferenciasInput>('/auth/preferencias', { method: 'PUT', body: dados })
  },

  async trocarSenha(dados: TrocarSenhaInput) {
    const resposta = await http<RespostaLogin>('/auth/trocar-senha', { method: 'POST', body: dados })
    definirAccessToken(resposta.accessToken)
    return resposta
  },
}
