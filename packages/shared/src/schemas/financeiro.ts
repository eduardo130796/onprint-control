import { z } from 'zod'
import { STATUS_COMISSAO, STATUS_CONTA } from '../enums-comercial'
import { TIPOS_CATEGORIA_FINANCEIRA, TIPOS_CONTA_FINANCEIRA, TIPOS_FORMA_PAGAMENTO } from '../financeiro'
import { paginacaoQuerySchema } from './comum'
import { decimal3, percentual, textoOpcional, uuidOpcional, valorMonetario } from './campos'

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (AAAA-MM-DD).')
const dataOpcional = z.preprocess((v) => (v === '' ? undefined : v), dataISO.optional())
const booleanoQuery = z.enum(['true', 'false']).optional()
const valorPositivo = valorMonetario.refine((v) => Number(v) > 0, 'Informe um valor maior que zero.')
const zeroOuMais = valorMonetario.default('0')
const motivo = z.string().trim().min(3, 'Informe o motivo.').max(500)
const nome = z.string().trim().min(2, 'Informe o nome.').max(120)

// ─── Cadastros ──────────────────────────────────────────────────────────────

export const formaPagamentoSchema = z.object({
  nome,
  tipo: z.enum(TIPOS_FORMA_PAGAMENTO),
  taxaPercentual: percentual.default('0'),
  diasRecebimento: z.coerce.number().int().min(0).max(365).default(0),
  permiteParcelamento: z.boolean().default(false),
  maxParcelas: z.coerce.number().int().min(1).max(24).default(1),
  contaFinanceiraId: uuidOpcional,
  ativo: z.boolean().default(true),
})
export type FormaPagamentoInput = z.input<typeof formaPagamentoSchema>

export const contaFinanceiraSchema = z.object({
  nome,
  tipo: z.enum(TIPOS_CONTA_FINANCEIRA),
  banco: textoOpcional,
  agencia: textoOpcional,
  numeroConta: textoOpcional,
  saldoInicial: zeroOuMais,
  ativo: z.boolean().default(true),
})
export type ContaFinanceiraInput = z.input<typeof contaFinanceiraSchema>

export const categoriaFinanceiraSchema = z.object({ nome, tipo: z.enum(TIPOS_CATEGORIA_FINANCEIRA), paiId: uuidOpcional, ativo: z.boolean().default(true) })
export type CategoriaFinanceiraInput = z.input<typeof categoriaFinanceiraSchema>

// ─── Títulos (contas a receber e a pagar) ──────────────────────────────────

const parcelamento = {
  valor: valorPositivo,
  /** Vencimento da 1ª parcela */
  vencimento: dataISO,
  parcelas: z.coerce.number().int().min(1, 'Mínimo 1 parcela.').max(60).default(1),
  intervaloDias: z.coerce.number().int().min(1).max(365).default(30),
}

export const contaReceberSchema = z.object({
  clienteId: z.string({ message: 'Escolha o cliente.' }).uuid('Escolha o cliente.'),
  descricao: z.string().trim().min(3, 'Descreva a conta.').max(200),
  ...parcelamento,
  categoriaId: uuidOpcional,
  formaPagamentoId: uuidOpcional,
  observacao: textoOpcional,
})
export type ContaReceberInput = z.input<typeof contaReceberSchema>

export const contaPagarSchema = z.object({
  fornecedorId: uuidOpcional,
  descricao: z.string().trim().min(3, 'Descreva a conta.').max(200),
  documento: textoOpcional,
  ...parcelamento,
  categoriaId: uuidOpcional,
  formaPagamentoId: uuidOpcional,
  contaFinanceiraId: uuidOpcional,
  observacao: textoOpcional,
})
export type ContaPagarInput = z.input<typeof contaPagarSchema>

/** Edição de um título: valor só enquanto não houver pagamento. */
export const tituloAtualizacaoSchema = z.object({
  descricao: z.string().trim().min(3, 'Descreva a conta.').max(200),
  documento: textoOpcional,
  valor: valorPositivo,
  vencimento: dataISO,
  categoriaId: uuidOpcional,
  formaPagamentoId: uuidOpcional,
  contaFinanceiraId: uuidOpcional,
  observacao: textoOpcional,
})
export type TituloAtualizacaoInput = z.input<typeof tituloAtualizacaoSchema>

export const baixaSchema = z.object({
  /** Total que entrou (ou saiu): principal + juros + multa − desconto */
  valorRecebido: valorPositivo,
  juros: zeroOuMais,
  multa: zeroOuMais,
  desconto: zeroOuMais,
  data: dataISO,
  formaPagamentoId: z.string({ message: 'Escolha a forma de pagamento.' }).uuid('Escolha a forma de pagamento.'),
  contaFinanceiraId: uuidOpcional,
  observacao: textoOpcional,
})
export type BaixaInput = z.input<typeof baixaSchema>

/** Valor avulso recebido de um pedido: o sistema abate nas parcelas em aberto, da mais antiga à mais nova. */
export const receberPedidoSchema = baixaSchema.pick({ valorRecebido: true, data: true, formaPagamentoId: true, contaFinanceiraId: true, observacao: true })
export type ReceberPedidoInput = z.input<typeof receberPedidoSchema>

export const cancelarTituloSchema = z.object({ motivo })
export const estornoSchema = z.object({ motivo })

export const titulosQuerySchema = paginacaoQuerySchema.extend({
  status: z.enum(STATUS_CONTA).optional(),
  /** Situação para a tela: em aberto (aberto/parcial/vencido) */
  abertos: booleanoQuery,
  atrasados: booleanoQuery,
  de: dataOpcional,
  ate: dataOpcional,
  clienteId: z.string().uuid().optional(),
  fornecedorId: z.string().uuid().optional(),
  pedidoId: z.string().uuid().optional(),
  categoriaId: z.string().uuid().optional(),
})
export type TitulosQuery = z.input<typeof titulosQuerySchema>

// ─── Fluxo, calendário, extrato e comissões ────────────────────────────────

export const fluxoQuerySchema = z.object({ de: dataISO, ate: dataISO, contaFinanceiraId: z.string().uuid().optional() })
export type FluxoQuery = z.input<typeof fluxoQuerySchema>

export const calendarioQuerySchema = z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/, 'Mês inválido (AAAA-MM).') })

export const movimentosQuerySchema = paginacaoQuerySchema.extend({
  de: dataOpcional,
  ate: dataOpcional,
  contaFinanceiraId: z.string().uuid().optional(),
  tipo: z.enum(['entrada', 'saida']).optional(),
  categoriaId: z.string().uuid().optional(),
})
export type MovimentosFinanceirosQuery = z.input<typeof movimentosQuerySchema>

export const comissoesQuerySchema = paginacaoQuerySchema.extend({
  status: z.enum(STATUS_COMISSAO).optional(),
  vendedorId: z.string().uuid().optional(),
})
export type ComissoesQuery = z.input<typeof comissoesQuerySchema>

export const pagarComissoesSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'Escolha ao menos uma comissão.').max(200),
  contaFinanceiraId: z.string({ message: 'Escolha a conta.' }).uuid('Escolha a conta.'),
  formaPagamentoId: uuidOpcional,
  data: dataISO,
})

// ─── Caixa / PDV ────────────────────────────────────────────────────────────

export const abrirCaixaSchema = z.object({ contaFinanceiraId: uuidOpcional, valorAbertura: zeroOuMais })

export const sangriaSuprimentoSchema = z.object({
  tipo: z.enum(['sangria', 'suprimento']),
  valor: valorPositivo,
  motivo,
  /** Conta de onde vem (suprimento) ou para onde vai (sangria) o dinheiro */
  contaFinanceiraId: uuidOpcional,
})
export type SangriaSuprimentoInput = z.input<typeof sangriaSuprimentoSchema>

export const fecharCaixaSchema = z.object({
  informados: z.array(z.object({ formaPagamentoId: z.string().uuid(), valor: zeroOuMais })).max(30),
  observacao: textoOpcional,
})
export type FecharCaixaInput = z.input<typeof fecharCaixaSchema>

export const vendaPdvSchema = z.object({
  clienteId: uuidOpcional,
  itens: z
    // O preço vem sempre do cadastro (a API recalcula a venda)
    .array(z.object({ produtoId: z.string().uuid(), quantidade: decimal3.refine((v) => Number(v) > 0, 'Quantidade inválida.') }))
    .min(1, 'Adicione ao menos um item.')
    .max(200),
  desconto: zeroOuMais,
  pagamentos: z.array(z.object({ formaPagamentoId: z.string().uuid(), valor: valorPositivo })).min(1, 'Informe o pagamento.').max(10),
})
export type VendaPdvInput = z.input<typeof vendaPdvSchema>

export const recebimentoCaixaSchema = z.object({
  contaReceberId: z.string().uuid(),
  valorRecebido: valorPositivo,
  juros: zeroOuMais,
  multa: zeroOuMais,
  desconto: zeroOuMais,
  formaPagamentoId: z.string().uuid('Escolha a forma de pagamento.'),
})
export type RecebimentoCaixaInput = z.input<typeof recebimentoCaixaSchema>

export const sessoesQuerySchema = paginacaoQuerySchema.extend({ usuarioId: z.string().uuid().optional(), de: dataOpcional, ate: dataOpcional })
export const vendasPdvQuerySchema = paginacaoQuerySchema.extend({ sessaoId: z.string().uuid().optional(), de: dataOpcional, ate: dataOpcional })
