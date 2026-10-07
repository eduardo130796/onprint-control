import { z } from 'zod'
import { SENHA_MIN } from './auth'
import { CATEGORIAS_TEMPLATE, ENTIDADES_COM_STATUS_PROPRIO, ENTIDADES_STATUS } from '../enums'
import { paginacaoQuerySchema } from './comum'
import {
  camposEndereco,
  cpfCnpjOpcional,
  decimal3,
  emailOpcional,
  percentual,
  telefoneOpcional,
  textoOpcional,
} from './campos'

const senhaProvisoria = z.string().min(SENHA_MIN, `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`)

// ─── Usuários ───────────────────────────────────────────────────────────────

const camposUsuario = {
  nome: z.string().trim().min(2, 'Informe o nome.').max(120),
  email: z.string().trim().toLowerCase().min(1, 'Informe o e-mail.').email('E-mail inválido.'),
  telefone: telefoneOpcional,
  papelId: z.string().uuid('Selecione o papel.'),
  comissaoPercentual: percentual.default('0'),
}

export const criarUsuarioSchema = z.object({ ...camposUsuario, senhaProvisoria })
export type CriarUsuarioInput = z.input<typeof criarUsuarioSchema>

export const editarUsuarioSchema = z.object({ ...camposUsuario, ativo: z.boolean().default(true) })
export type EditarUsuarioInput = z.input<typeof editarUsuarioSchema>

export const redefinirSenhaSchema = z.object({ senhaProvisoria })
export type RedefinirSenhaInput = z.input<typeof redefinirSenhaSchema>

export const usuariosQuerySchema = paginacaoQuerySchema.extend({
  ativo: z.enum(['true', 'false', 'todos']).default('todos'),
  papelId: z.string().uuid().optional(),
})
export type UsuariosQuery = z.input<typeof usuariosQuerySchema>

// ─── Permissões ─────────────────────────────────────────────────────────────

export const permissoesPapelSchema = z.object({
  permissoes: z.array(z.string().regex(/^[a-z_]+:[a-z_]+$/, 'Permissão inválida.')).max(500),
})
export type PermissoesPapelInput = z.input<typeof permissoesPapelSchema>

// ─── Empresa ────────────────────────────────────────────────────────────────

export const empresaSchema = z.object({
  razaoSocial: z.string().trim().min(2, 'Informe a razão social.').max(200),
  nomeFantasia: textoOpcional,
  cnpj: cpfCnpjOpcional,
  ie: textoOpcional,
  email: emailOpcional,
  telefone: telefoneOpcional,
  whatsapp: telefoneOpcional,
  site: textoOpcional,
  ...camposEndereco,
  validadeOrcamentoDias: z.coerce.number().int().min(1, 'Mínimo 1 dia.').max(365),
  condicoesPadrao: textoOpcional,
  sinalPercentual: percentual,
  chavePix: textoOpcional,
  areaMinimaM2: decimal3,
})
export type EmpresaInput = z.input<typeof empresaSchema>

// ─── Status e templates ─────────────────────────────────────────────────────

export const statusConfigSchema = z.object({
  rotulo: z.string().trim().min(1, 'Informe o rótulo.').max(60),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor no formato #RRGGBB.'),
  ordem: z.coerce.number().int().min(0).max(999),
  /** false = oculto (some do kanban quando a coluna está vazia) */
  ativo: z.boolean().optional(),
})
export type StatusConfigInput = z.input<typeof statusConfigSchema>

/** Novo status próprio: nome, cor e o status do sistema que ele "conta como". */
export const novoStatusSchema = statusConfigSchema.extend({
  entidade: z.enum(ENTIDADES_COM_STATUS_PROPRIO, { message: 'Status próprios só existem em orçamentos, pedidos e produção.' }),
  base: z.string().trim().min(1, 'Escolha a qual status do sistema ele corresponde.'),
  ordem: z.coerce.number().int().min(0).max(999).optional(),
})
export type NovoStatusInput = z.input<typeof novoStatusSchema>

/** Coloca o registro numa coluna própria (ou volta para a do sistema com null). */
export const statusPersonalizadoSchema = z.object({ statusPersonalizadoId: z.string().uuid().nullable() })

export const statusQuerySchema = z.object({ entidade: z.enum(ENTIDADES_STATUS).optional() })

export const templateSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome.').max(120),
  categoria: z.enum(CATEGORIAS_TEMPLATE),
  conteudo: z.string().trim().min(5, 'Escreva a mensagem.').max(4000),
  ativo: z.boolean().default(true),
})
export type TemplateInput = z.input<typeof templateSchema>
