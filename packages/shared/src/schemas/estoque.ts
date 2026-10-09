import { z } from 'zod'
import { SITUACOES_ESTOQUE, TIPOS_MOVIMENTACAO } from '../estoque'
import { paginacaoQuerySchema } from './comum'
import { decimal3, normalizarDecimal, textoOpcional, uuidOpcional, valorMonetario } from './campos'

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (AAAA-MM-DD).')
const dataOpcional = z.preprocess((v) => (v === '' ? undefined : v), dataISO.optional())
const positivo = decimal3.refine((v) => Number(v) > 0, 'Informe uma quantidade maior que zero.')
const custo = z
  .union([z.string(), z.number()])
  .transform(normalizarDecimal)
  .refine((v) => /^\d{1,8}(\.\d{1,4})?$/.test(v), 'Custo inválido.')
const motivoObrigatorio = z.string().trim().min(3, 'Informe o motivo.').max(500)

export const localEstoqueSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome.').max(120),
  descricao: textoOpcional,
  padrao: z.boolean().default(false),
  ativo: z.boolean().default(true),
})
export type LocalEstoqueInput = z.input<typeof localEstoqueSchema>

export const entradaItemSchema = z.object({
  produtoId: z.string({ message: 'Escolha o produto.' }).uuid('Escolha o produto.'),
  quantidade: positivo,
  custoUnitario: custo,
})

export const entradaEstoqueSchema = z.object({
  fornecedorId: uuidOpcional,
  localId: z.string().uuid('Escolha o local.'),
  notaFiscal: textoOpcional,
  dataEntrada: dataISO,
  observacoes: textoOpcional,
  itens: z.array(entradaItemSchema).min(1, 'Inclua ao menos um item.').max(200),
  /** Compra a prazo: gera as contas a pagar (exige fornecedor); a soma das parcelas = total da entrada */
  contaPagar: z
    .object({
      parcelas: z.array(z.object({ vencimento: dataISO, valor: valorMonetario })).min(1).max(24),
      formaPagamentoId: uuidOpcional,
      /** Categoria financeira; vazio = "Compras de insumos" */
      categoriaId: uuidOpcional,
    })
    .optional(),
})
export type EntradaEstoqueInput = z.input<typeof entradaEstoqueSchema>

/** Lançamento manual: saída e perda baixam; ajuste informa o saldo contado; transferência move entre locais. */
export const movimentacaoManualSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('saida'), produtoId: z.string().uuid(), localId: z.string().uuid(), quantidade: positivo, motivo: motivoObrigatorio }),
  z.object({ tipo: z.literal('perda'), produtoId: z.string().uuid(), localId: z.string().uuid(), quantidade: positivo, motivo: motivoObrigatorio }),
  z.object({ tipo: z.literal('ajuste'), produtoId: z.string().uuid(), localId: z.string().uuid(), saldoContado: decimal3, motivo: motivoObrigatorio }),
  z.object({
    tipo: z.literal('transferencia'),
    produtoId: z.string().uuid(),
    localId: z.string().uuid(),
    localDestinoId: z.string().uuid('Escolha o local de destino.'),
    quantidade: positivo,
    motivo: textoOpcional,
  }),
])
export type MovimentacaoManualInput = z.input<typeof movimentacaoManualSchema>

const booleanoQuery = z.enum(['true', 'false']).optional()

export const posicaoEstoqueQuerySchema = paginacaoQuerySchema.extend({
  localId: z.string().uuid().optional(),
  categoriaId: z.string().uuid().optional(),
  situacao: z.enum(SITUACOES_ESTOQUE).optional(),
  /** Alertas: só abaixo do mínimo ou zerados */
  alertas: booleanoQuery,
})
export type PosicaoEstoqueQuery = z.input<typeof posicaoEstoqueQuerySchema>

export const movimentacoesQuerySchema = paginacaoQuerySchema.extend({
  tipo: z.enum(TIPOS_MOVIMENTACAO).optional(),
  produtoId: z.string().uuid().optional(),
  localId: z.string().uuid().optional(),
  opId: z.string().uuid().optional(),
  pedidoId: z.string().uuid().optional(),
  de: dataOpcional,
  ate: dataOpcional,
})
export type MovimentacoesQuery = z.input<typeof movimentacoesQuerySchema>

export const entradasQuerySchema = paginacaoQuerySchema.extend({
  fornecedorId: z.string().uuid().optional(),
  de: dataOpcional,
  ate: dataOpcional,
})
export type EntradasEstoqueQuery = z.input<typeof entradasQuerySchema>
