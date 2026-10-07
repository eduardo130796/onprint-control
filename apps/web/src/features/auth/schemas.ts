import { z } from 'zod'
import { SENHA_MIN } from '@onprint/shared'

export { loginSchema, type LoginInput } from '@onprint/shared'

/** Formulário de troca de senha: schema da API + confirmação (só no front). */
export const trocarSenhaFormSchema = z
  .object({
    senhaAtual: z.string().min(1, 'Informe a senha atual.'),
    novaSenha: z.string().min(SENHA_MIN, `A nova senha precisa ter pelo menos ${SENHA_MIN} caracteres.`),
    confirmacao: z.string(),
  })
  .refine((v) => v.novaSenha === v.confirmacao, { message: 'As senhas não conferem.', path: ['confirmacao'] })
  .refine((v) => v.novaSenha !== v.senhaAtual, {
    message: 'A nova senha precisa ser diferente da atual.',
    path: ['novaSenha'],
  })
export type TrocarSenhaForm = z.infer<typeof trocarSenhaFormSchema>

/** Nova senha pelo link do e-mail: senha + confirmação. */
export const novaSenhaFormSchema = z
  .object({
    novaSenha: z.string().min(SENHA_MIN, `A nova senha precisa ter pelo menos ${SENHA_MIN} caracteres.`),
    confirmacao: z.string(),
  })
  .refine((v) => v.novaSenha === v.confirmacao, { message: 'As senhas não conferem.', path: ['confirmacao'] })
export type NovaSenhaForm = z.infer<typeof novaSenhaFormSchema>
