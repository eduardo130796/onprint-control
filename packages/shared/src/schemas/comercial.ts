import { z } from 'zod'
import { ORIGENS_CLIENTE } from '../enums'
import { PRIORIDADES, STATUS_ORCAMENTO, STATUS_SOLICITACAO, TIPOS_ENTREGA } from '../enums-comercial'
import { paginacaoQuerySchema } from './comum'
import { normalizarDecimal, telefoneOpcional, textoOpcional, uuidOpcional, valorMonetario } from './campos'

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (AAAA-MM-DD).')
const dataOpcional = z.preprocess((v) => (v === '' ? null : v), dataISO.nullable().optional())

const medidaOpcional = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : normalizarDecimal(v as string)),
  z
    .string()
    .regex(/^\d{1,5}(\.\d{1,3})?$/, 'Medida inválida (use metros, ex.: 1,50).')
    .refine((v) => Number(v) > 0, 'A medida deve ser maior que zero.')
    .nullable()
    .optional(),
)

const quantidade = z
  .union([z.string(), z.number()])
  .transform(normalizarDecimal)
  .refine((v) => /^\d{1,9}(\.\d{1,3})?$/.test(v) && Number(v) > 0, 'Quantidade inválida.')

// ─── Solicitações de orçamento ──────────────────────────────────────────────

/** Cadastro rápido: cliente existente OU pré-cadastro na mesma tela. */
export const solicitacaoSchema = z
  .object({
    clienteId: uuidOpcional,
    novoCliente: z
      .object({
        nome: z.string().trim().min(2, 'Informe o nome do cliente.').max(200),
        whatsapp: telefoneOpcional,
        telefone: telefoneOpcional,
      })
      .nullable()
      .optional(),
    origem: z.enum(ORIGENS_CLIENTE).default('whatsapp'),
    descricao: z.string().trim().min(3, 'Descreva o que o cliente pediu.').max(4000),
    prazoDesejado: dataOpcional,
    responsavelId: uuidOpcional,
  })
  .refine((s) => Boolean(s.clienteId) !== Boolean(s.novoCliente), {
    message: 'Escolha um cliente ou faça o pré-cadastro.',
    path: ['clienteId'],
  })
  .refine((s) => !s.novoCliente || Boolean(s.novoCliente.whatsapp || s.novoCliente.telefone), {
    message: 'Informe o WhatsApp ou telefone do novo cliente.',
    path: ['novoCliente', 'whatsapp'],
  })
export type SolicitacaoInput = z.input<typeof solicitacaoSchema>

export const solicitacoesQuerySchema = paginacaoQuerySchema.extend({
  status: z.enum(STATUS_SOLICITACAO).optional(),
  clienteId: z.string().uuid().optional(),
  /** Ex.: "site" = pedidos da vitrine */
  origem: z.enum(ORIGENS_CLIENTE).optional(),
})
export type SolicitacoesQuery = z.input<typeof solicitacoesQuerySchema>

export const descartarSolicitacaoSchema = z.object({ motivo: z.string().trim().min(3, 'Informe o motivo.').max(500) })

// ─── Orçamentos ─────────────────────────────────────────────────────────────

export const orcamentoItemSchema = z.object({
  produtoId: z.string().uuid('Escolha o produto.'),
  /** Vazio = nome do produto */
  descricao: textoOpcional,
  quantidade,
  largura: medidaOpcional,
  altura: medidaOpcional,
  /** Vazio = preço de venda do produto */
  precoUnitario: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : v), valorMonetario.nullable().optional()),
  acabamentoIds: z.array(z.string().uuid()).max(30).default([]),
  desconto: valorMonetario.default('0'),
  observacao: textoOpcional,
})
export type OrcamentoItemInput = z.input<typeof orcamentoItemSchema>

export const orcamentoSchema = z.object({
  clienteId: z.string().uuid('Escolha o cliente.'),
  vendedorId: uuidOpcional,
  solicitacaoId: uuidOpcional,
  /** Vazio = hoje + validade padrão da empresa */
  validade: dataOpcional,
  desconto: valorMonetario.default('0'),
  acrescimo: valorMonetario.default('0'),
  frete: valorMonetario.default('0'),
  condicoes: textoOpcional,
  observacoes: textoOpcional,
  observacoesInternas: textoOpcional,
  itens: z.array(orcamentoItemSchema).min(1, 'Adicione ao menos um item.').max(100),
})
export type OrcamentoInput = z.input<typeof orcamentoSchema>

export const orcamentosQuerySchema = paginacaoQuerySchema.extend({
  status: z.enum(STATUS_ORCAMENTO).optional(),
  clienteId: z.string().uuid().optional(),
  vendedorId: z.string().uuid().optional(),
  /** Kanban: esconde convertidos, recusados e expirados parados há mais de 30 dias */
  kanban: z.enum(['true', 'false']).optional(),
})
export type OrcamentosQuery = z.input<typeof orcamentosQuerySchema>

export const recusaSchema = z.object({ motivo: z.string().trim().min(3, 'Informe o motivo da recusa.').max(1000) })

/** Aprovação interna (pelo vendedor, em nome do cliente). */
export const aprovacaoInternaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe quem aprovou.').max(160),
})

export const conversaoSchema = z.object({
  sinalPercentual: z
    .union([z.string(), z.number()])
    .transform(normalizarDecimal)
    .refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 100, 'Sinal entre 0 e 100%.'),
  parcelas: z.coerce.number().int().min(0).max(24).default(1),
  intervaloDias: z.coerce.number().int().min(1).max(120).default(30),
  primeiroVencimento: dataOpcional,
  tipoEntrega: z.enum(TIPOS_ENTREGA).default('retirada'),
  enderecoEntregaId: uuidOpcional,
  prioridade: z.enum(PRIORIDADES).default('normal'),
  observacoes: textoOpcional,
})
export type ConversaoInput = z.input<typeof conversaoSchema>

// ─── Link público (sem login) ───────────────────────────────────────────────

export const aprovacaoPublicaSchema = z.object({
  nome: z.string().trim().min(3, 'Informe seu nome completo.').max(160),
  aceite: z.literal(true, { message: 'Confirme que leu e aprova o orçamento.' }),
})
export type AprovacaoPublicaInput = z.input<typeof aprovacaoPublicaSchema>

export const tokenPublicoParamSchema = z.object({ token: z.string().min(20).max(100) })
