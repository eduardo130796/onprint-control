import type { LoginInput, RespostaLogin, TrocarSenhaInput, UsuarioLogado } from '@onprint/shared'
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

  async trocarSenha(dados: TrocarSenhaInput) {
    const resposta = await http<RespostaLogin>('/auth/trocar-senha', { method: 'POST', body: dados })
    definirAccessToken(resposta.accessToken)
    return resposta
  },
}
