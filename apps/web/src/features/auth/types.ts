import type { LoginInput, TrocarSenhaInput, UsuarioLogado } from '@onprint/shared'

export interface AuthContextValue {
  usuario: UsuarioLogado | null
  /** true enquanto a sessão inicial (cookie de refresh) está sendo verificada */
  carregando: boolean
  entrar: (dados: LoginInput) => Promise<UsuarioLogado>
  sair: () => Promise<void>
  trocarSenha: (dados: TrocarSenhaInput) => Promise<void>
}
