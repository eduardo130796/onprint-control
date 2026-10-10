import type { LoginInput, TrocarSenhaInput, UsuarioLogado } from '@onprint/shared'

export type MarcaEmpresa = Partial<Pick<UsuarioLogado['empresa'], 'exibicao' | 'logoArquivoId' | 'corTema'>>

export interface AuthContextValue {
  usuario: UsuarioLogado | null
  /** true enquanto a sessão inicial (cookie de refresh) está sendo verificada */
  carregando: boolean
  entrar: (dados: LoginInput) => Promise<UsuarioLogado>
  sair: () => Promise<void>
  trocarSenha: (dados: TrocarSenhaInput) => Promise<void>
  /** Depois de trocar logo, nome ou cor em Configurações: o topo, a aba e o tema mudam na hora */
  atualizarMarca: (marca: MarcaEmpresa) => void
  /** Modo claro/escuro do próprio usuário: muda na hora e fica salvo na conta */
  definirModoTela: (modo: UsuarioLogado['modoTela']) => Promise<void>
  /** Salva preferências visuais do usuário (modo, fonte, peso); aplica na hora e desfaz se falhar */
  definirPreferencias: (p: Partial<Pick<UsuarioLogado, 'modoTela' | 'fonte' | 'pesoTexto' | 'escala'>>) => Promise<void>
}
