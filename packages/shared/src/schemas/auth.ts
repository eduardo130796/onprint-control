import { z } from 'zod'
import { NIVEIS_ACESSO } from '../assinatura'

export const SENHA_MIN = 8
/** Teto da senha: o hash (argon2) de textos enormes custaria CPU à toa */
export const SENHA_MAX = 256
const MSG_SENHA_MAX = `A senha pode ter no máximo ${SENHA_MAX} caracteres.`

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Informe o e-mail.').email('E-mail inválido.'),
  senha: z.string().min(1, 'Informe a senha.').max(SENHA_MAX, MSG_SENHA_MAX),
})
export type LoginInput = z.infer<typeof loginSchema>

export const trocarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1, 'Informe a senha atual.').max(SENHA_MAX, MSG_SENHA_MAX),
    novaSenha: z.string().min(SENHA_MIN, `A nova senha precisa ter pelo menos ${SENHA_MIN} caracteres.`).max(SENHA_MAX, MSG_SENHA_MAX),
  })
  .refine((v) => v.senhaAtual !== v.novaSenha, {
    message: 'A nova senha precisa ser diferente da atual.',
    path: ['novaSenha'],
  })
export type TrocarSenhaInput = z.infer<typeof trocarSenhaSchema>

/** "Esqueci a senha": só o e-mail; a resposta é sempre a mesma, exista ou não a conta. */
export const esqueciSenhaSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Informe o e-mail.').email('E-mail inválido.'),
})
export type EsqueciSenhaInput = z.infer<typeof esqueciSenhaSchema>

/** Nova senha pelo link do e-mail (esqueci a senha ou convite). */
export const novaSenhaPorLinkSchema = z.object({
  token: z.string().min(20).max(200),
  novaSenha: z.string().min(SENHA_MIN, `A nova senha precisa ter pelo menos ${SENHA_MIN} caracteres.`).max(SENHA_MAX, MSG_SENHA_MAX),
})
export type NovaSenhaPorLinkInput = z.infer<typeof novaSenhaPorLinkSchema>

export const linkSenhaParamSchema = z.object({ token: z.string().min(20).max(200) })

/** O que a tela de nova senha mostra antes de o usuário digitar. */
export const linkSenhaInfoSchema = z.object({
  nome: z.string(),
  email: z.string(),
  empresa: z.string(),
  finalidade: z.enum(['redefinir', 'convite']),
})
export type LinkSenhaInfo = z.infer<typeof linkSenhaInfoSchema>

export const MODOS_TELA = ['claro', 'escuro', 'sistema'] as const
export type ModoTelaUsuario = (typeof MODOS_TELA)[number]
/** Fonte do texto do sistema (cada pessoa escolhe a sua; documentos e PDFs não mudam) */
export const FONTES_TEXTO = ['inter', 'jakarta', 'lexend', 'nunito'] as const
export type FonteTexto = (typeof FONTES_TEXTO)[number]
/** Peso do texto: leve (mais fino, descansa a vista), normal ou forte (mais carregado) */
export const PESOS_TEXTO = ['leve', 'normal', 'forte'] as const
export type PesoTexto = (typeof PESOS_TEXTO)[number]
/** Tamanho da interface (escala de tudo: texto, espaços, menu): compacto ≈ 80%, padrão, grande */
export const ESCALAS_INTERFACE = ['compacto', 'padrao', 'grande'] as const
export type EscalaInterface = (typeof ESCALAS_INTERFACE)[number]
/** Preferências do próprio usuário (modo da tela e texto); envia só o que mudou */
export const preferenciasSchema = z
  .object({ modoTela: z.enum(MODOS_TELA), fonte: z.enum(FONTES_TEXTO), pesoTexto: z.enum(PESOS_TEXTO), escala: z.enum(ESCALAS_INTERFACE) })
  .partial()
  .refine((p) => Object.keys(p).length > 0, 'Informe ao menos uma preferência')
export type PreferenciasInput = z.infer<typeof preferenciasSchema>

export const usuarioLogadoSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  email: z.string(),
  avatar: z.string().nullable(),
  deveTrocarSenha: z.boolean(),
  /** Modo da tela escolhido pelo usuário */
  modoTela: z.enum(MODOS_TELA),
  /** Fonte e peso do texto escolhidos pelo usuário */
  fonte: z.enum(FONTES_TEXTO),
  pesoTexto: z.enum(PESOS_TEXTO),
  escala: z.enum(ESCALAS_INTERFACE),
  papel: z.object({ id: z.string().uuid(), codigo: z.string(), nome: z.string() }),
  /** Lista de permissões no formato "modulo:acao" */
  permissoes: z.array(z.string()),
  /** Empresa assinante do usuário (o slug identifica os links públicos) */
  empresa: z.object({
    id: z.string().uuid(),
    nome: z.string(),
    slug: z.string(),
    /** Nome que aparece no sistema (nome fantasia, razão social ou o do cadastro) */
    exibicao: z.string(),
    logoArquivoId: z.string().uuid().nullable(),
    /** Cor do tema (TEMAS); null = azul GrafyGo */
    corTema: z.string().nullable(),
    /** Minutos sem uso até sair sozinho */
    inatividadeMinutos: z.number(),
  }),
  /** Usuário de painel (TV da produção): não sai por inatividade */
  semInatividade: z.boolean(),
  /** Situação da assinatura para avisos e bloqueio na tela (as permissões já vêm filtradas por ela) */
  assinatura: z
    .object({
      plano: z.string(),
      nivel: z.enum(NIVEIS_ACESSO),
      motivo: z.string(),
      mensagem: z.string(),
      diasAtraso: z.number(),
      diasRestantesTeste: z.number().nullable(),
      diasParaSomenteLeitura: z.number().nullable(),
      diasParaBloqueio: z.number().nullable(),
    })
    .nullable(),
})
export type UsuarioLogado = z.infer<typeof usuarioLogadoSchema>

export const respostaLoginSchema = z.object({
  accessToken: z.string(),
  usuario: usuarioLogadoSchema,
})
export type RespostaLogin = z.infer<typeof respostaLoginSchema>
