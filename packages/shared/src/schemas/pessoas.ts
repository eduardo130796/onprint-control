import { z } from 'zod'
import { ORIGENS_CLIENTE, SITUACOES_CLIENTE, TIPOS_ENDERECO, TIPOS_PESSOA } from '../enums'
import { paginacaoQuerySchema } from './comum'
import {
  camposEndereco,
  cepOpcional,
  cpfCnpjOpcional,
  emailOpcional,
  inteiroOpcional,
  telefoneOpcional,
  textoOpcional,
  ufOpcional,
  uuidOpcional,
  valorMonetario,
} from './campos'

const nome = z.string().trim().min(2, 'Informe o nome (mínimo 2 caracteres).').max(200)

/** Documento coerente com o tipo de pessoa (CPF para PF, CNPJ para PJ). */
function documentoCompativel(v: { tipoPessoa: string; cpfCnpj?: string | null }) {
  if (!v.cpfCnpj) return true
  return v.tipoPessoa === 'PF' ? v.cpfCnpj.length === 11 : v.cpfCnpj.length === 14
}
const erroDocumento = { message: 'Use CPF para pessoa física e CNPJ para jurídica.', path: ['cpfCnpj'] }

// ─── Clientes ───────────────────────────────────────────────────────────────

export const clienteSchema = z
  .object({
    tipoPessoa: z.enum(TIPOS_PESSOA).default('PF'),
    nome,
    fantasia: textoOpcional,
    cpfCnpj: cpfCnpjOpcional,
    ie: textoOpcional,
    email: emailOpcional,
    telefone: telefoneOpcional,
    whatsapp: telefoneOpcional,
    origem: z.preprocess((v) => (v === '' ? null : v), z.enum(ORIGENS_CLIENTE).nullable().optional()),
    situacao: z.enum(SITUACOES_CLIENTE).default('pre_cadastro'),
    limiteCredito: valorMonetario.default('0'),
    vendedorId: uuidOpcional,
    observacoes: textoOpcional,
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  })
  .refine(documentoCompativel, erroDocumento)
  .refine((v) => Boolean(v.whatsapp || v.telefone || v.email), {
    message: 'Informe ao menos um contato: WhatsApp, telefone ou e-mail.',
    path: ['whatsapp'],
  })
export type ClienteInput = z.input<typeof clienteSchema>
export type ClienteDados = z.output<typeof clienteSchema>

export const clientesQuerySchema = paginacaoQuerySchema.extend({
  situacao: z.enum(SITUACOES_CLIENTE).optional(),
  vendedorId: z.string().uuid().optional(),
  ativo: z.enum(['true', 'false', 'todos']).default('true'),
})
export type ClientesQuery = z.input<typeof clientesQuerySchema>

export const enderecoSchema = z.object({
  tipo: z.enum(TIPOS_ENDERECO).default('principal'),
  cep: cepOpcional,
  logradouro: z.string().trim().min(2, 'Informe o logradouro.').max(200),
  numero: textoOpcional,
  complemento: textoOpcional,
  bairro: textoOpcional,
  cidade: z.string().trim().min(2, 'Informe a cidade.').max(120),
  uf: ufOpcional.refine((v) => Boolean(v), 'Informe a UF.'),
  referencia: textoOpcional,
})
export type EnderecoInput = z.input<typeof enderecoSchema>

export const contatoSchema = z.object({
  nome,
  cargo: textoOpcional,
  email: emailOpcional,
  telefone: telefoneOpcional,
  whatsapp: telefoneOpcional,
  principal: z.boolean().default(false),
})
export type ContatoInput = z.input<typeof contatoSchema>

// ─── Fornecedores ───────────────────────────────────────────────────────────

export const fornecedorSchema = z
  .object({
    tipoPessoa: z.enum(TIPOS_PESSOA).default('PJ'),
    nome,
    fantasia: textoOpcional,
    cpfCnpj: cpfCnpjOpcional,
    ie: textoOpcional,
    email: emailOpcional,
    telefone: telefoneOpcional,
    whatsapp: telefoneOpcional,
    contato: textoOpcional,
    categoriaFornecimento: textoOpcional,
    prazoMedioDias: inteiroOpcional,
    condicoesPagamento: textoOpcional,
    ...camposEndereco,
    observacoes: textoOpcional,
  })
  .refine(documentoCompativel, erroDocumento)
export type FornecedorInput = z.input<typeof fornecedorSchema>

export const fornecedoresQuerySchema = paginacaoQuerySchema.extend({
  ativo: z.enum(['true', 'false', 'todos']).default('true'),
})
export type FornecedoresQuery = z.input<typeof fornecedoresQuerySchema>
