import { z } from 'zod'

export const SENHA_MIN = 8

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Informe o e-mail.').email('E-mail inválido.'),
  senha: z.string().min(1, 'Informe a senha.'),
})
export type LoginInput = z.infer<typeof loginSchema>

export const trocarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1, 'Informe a senha atual.'),
    novaSenha: z.string().min(SENHA_MIN, `A nova senha precisa ter pelo menos ${SENHA_MIN} caracteres.`),
  })
  .refine((v) => v.senhaAtual !== v.novaSenha, {
    message: 'A nova senha precisa ser diferente da atual.',
    path: ['novaSenha'],
  })
export type TrocarSenhaInput = z.infer<typeof trocarSenhaSchema>

export const usuarioLogadoSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  email: z.string(),
  avatar: z.string().nullable(),
  deveTrocarSenha: z.boolean(),
  papel: z.object({ id: z.string().uuid(), codigo: z.string(), nome: z.string() }),
  /** Lista de permissões no formato "modulo:acao" */
  permissoes: z.array(z.string()),
  /** Empresa assinante do usuário (o slug identifica os links públicos) */
  empresa: z.object({ id: z.string().uuid(), nome: z.string(), slug: z.string() }),
})
export type UsuarioLogado = z.infer<typeof usuarioLogadoSchema>

export const respostaLoginSchema = z.object({
  accessToken: z.string(),
  usuario: usuarioLogadoSchema,
})
export type RespostaLogin = z.infer<typeof respostaLoginSchema>
