import { z } from 'zod'
import { BASES_INSUMO, MODOS_CALCULO, STATUS_MAQUINA, TIPOS_COBRANCA, TIPOS_PRODUTO } from '../enums'
import { paginacaoQuerySchema } from './comum'
import { decimal3, inteiroOpcional, normalizarDecimal, percentual, textoOpcional, uuidOpcional, valorMonetario } from './campos'

const nome = z.string().trim().min(2, 'Informe o nome.').max(160)
const filtroAtivo = z.enum(['true', 'false', 'todos']).default('true')

/** Medida opcional em metros (até 3 casas); vazio vira null. */
const medidaOpcional = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : normalizarDecimal(v as string)),
  z
    .string()
    .regex(/^\d{1,5}(\.\d{1,3})?$/, 'Medida inválida (use metros, ex.: 1,50).')
    .refine((v) => Number(v) > 0, 'A medida deve ser maior que zero.')
    .nullable()
    .optional(),
)

const valorOpcional = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : v),
  valorMonetario.nullable().optional(),
)

export const cadastroQuerySchema = paginacaoQuerySchema.extend({ ativo: filtroAtivo })
export type CadastroQuery = z.input<typeof cadastroQuerySchema>

// ─── Categorias ─────────────────────────────────────────────────────────────

export const categoriaSchema = z.object({
  nome,
  paiId: uuidOpcional,
  ativo: z.boolean().default(true),
})
export type CategoriaInput = z.input<typeof categoriaSchema>

// ─── Acabamentos ────────────────────────────────────────────────────────────

export const acabamentoSchema = z.object({
  nome,
  descricao: textoOpcional,
  tipoCobranca: z.enum(TIPOS_COBRANCA),
  valor: valorMonetario,
  custo: valorMonetario.default('0'),
  prazoAdicionalDias: z.coerce.number().int().min(0).max(365).default(0),
  ativo: z.boolean().default(true),
  /** Insumos que o acabamento consome, por unidade da cobrança (ilhós: 2 por metro de perímetro) — custo e baixa de estoque */
  materiais: z
    .array(
      z.object({
        insumoId: z.string().uuid(),
        quantidade: z
          .union([z.string(), z.number()])
          .transform(normalizarDecimal)
          .refine((v) => /^\d{1,8}(\.\d{1,4})?$/.test(v) && Number(v) > 0, 'Quantidade inválida.'),
        perdaPercentual: percentual.default('0'),
      }),
    )
    .max(30)
    // Não enviado = não mexe nos materiais (telas antigas)
    .optional(),
})
export type AcabamentoInput = z.input<typeof acabamentoSchema>

// ─── Máquinas e processos ───────────────────────────────────────────────────

export const maquinaSchema = z.object({
  nome,
  tipo: textoOpcional,
  larguraUtil: medidaOpcional,
  velocidadeM2Hora: z.preprocess((v) => (v === '' || v == null ? null : normalizarDecimal(v as string)), z.string().regex(/^\d{1,6}(\.\d{1,2})?$/, 'Velocidade inválida.').nullable().optional()),
  custoHora: valorMonetario.default('0'),
  status: z.enum(STATUS_MAQUINA).default('ativa'),
  observacoes: textoOpcional,
  ativo: z.boolean().default(true),
})
export type MaquinaInput = z.input<typeof maquinaSchema>

export const maquinasQuerySchema = cadastroQuerySchema.extend({ status: z.enum(STATUS_MAQUINA).optional() })

export const processoSchema = z.object({
  nome,
  descricao: textoOpcional,
  maquinaPadraoId: uuidOpcional,
  tempoPadraoMinutos: inteiroOpcional,
  /** Mão de obra sem máquina: vale quando a máquina não tem custo/hora */
  custoHora: valorMonetario.default('0'),
  ativo: z.boolean().default(true),
})
export type ProcessoInput = z.input<typeof processoSchema>

// ─── Produtos ───────────────────────────────────────────────────────────────

/** Custo por unidade de cálculo: até 4 casas (insumos e custo calculado pela composição). */
const custo4 = z
  .union([z.string(), z.number()])
  .transform(normalizarDecimal)
  .refine((v) => /^\d{1,8}(\.\d{1,4})?$/.test(v), 'Custo inválido.')
const margem = z
  .union([z.string(), z.number()])
  .transform(normalizarDecimal)
  .refine((v) => /^\d{1,5}(\.\d{1,2})?$/.test(v), 'Margem inválida.')
/** Ausente = não muda; vazio/null = limpa (padrão da empresa). */
const semPadrao = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional())

const produtoBase = z.object({
  codigo: z.preprocess((v) => (typeof v === 'string' && !v.trim() ? null : v), z.string().trim().toUpperCase().max(30).nullable().optional()),
  nome,
  descricao: textoOpcional,
  categoriaId: uuidOpcional,
  unidadeMedidaId: uuidOpcional,
  tipo: z.enum(TIPOS_PRODUTO).default('produto'),
  modoCalculo: z.enum(MODOS_CALCULO).default('unidade'),
  precoVenda: valorMonetario.default('0'),
  custo: custo4.default('0'),
  margem: margem.default('0'),
  precoMinimo: valorOpcional,
  /** Custo e preço completos ficam em PUT /produtos/:id/composicao; aqui são opcionais */
  modoCusto: z.enum(['simples', 'composicao']).optional(),
  lucroDesejado: semPadrao(percentual),
  lucroMinimo: semPadrao(percentual),
  larguraPadrao: medidaOpcional,
  alturaPadrao: medidaOpcional,
  larguraMaxima: medidaOpcional,
  alturaMaxima: medidaOpcional,
  prazoProducaoDias: z.coerce.number().int().min(0).max(365).default(0),
  controlaEstoque: z.boolean().default(false),
  estoqueMinimo: decimal3.default('0'),
  ativo: z.boolean().default(true),
})

const minimoAteVenda = {
  message: 'O preço mínimo não pode ser maior que o preço de venda.',
  path: ['precoMinimo'],
}

export const produtoSchema = produtoBase.refine((p) => !p.precoMinimo || Number(p.precoMinimo) <= Number(p.precoVenda), minimoAteVenda)
export type ProdutoInput = z.input<typeof produtoSchema>

/**
 * Edição (PUT /produtos/:id): preço, custo, margem, preço mínimo e lucro só mudam quando enviados
 * (ausente = mantém; a tela de Custo e preço é a dona desses campos).
 */
export const produtoAtualizacaoSchema = produtoBase
  .extend({
    precoVenda: valorMonetario.optional(),
    custo: custo4.optional(),
    margem: margem.optional(),
    precoMinimo: semPadrao(valorMonetario),
  })
  .refine((p) => !p.precoMinimo || p.precoVenda === undefined || Number(p.precoMinimo) <= Number(p.precoVenda), minimoAteVenda)
export type ProdutoAtualizacaoInput = z.input<typeof produtoAtualizacaoSchema>

export const produtosQuerySchema = cadastroQuerySchema.extend({
  tipo: z.enum(TIPOS_PRODUTO).optional(),
  modoCalculo: z.enum(MODOS_CALCULO).optional(),
  categoriaId: z.string().uuid().optional(),
})
export type ProdutosQuery = z.input<typeof produtosQuerySchema>

/** Listas da composição do produto: cada PUT substitui a lista inteira. */
export const produtoAcabamentosSchema = z.object({
  itens: z
    .array(z.object({ acabamentoId: z.string().uuid(), obrigatorio: z.boolean().default(false), padrao: z.boolean().default(false) }))
    .max(50),
})
export type ProdutoAcabamentosInput = z.input<typeof produtoAcabamentosSchema>

export const produtoInsumosSchema = z.object({
  itens: z
    .array(
      z.object({
        insumoId: z.string().uuid(),
        quantidade: z
          .union([z.string(), z.number()])
          .transform(normalizarDecimal)
          .refine((v) => /^\d{1,8}(\.\d{1,4})?$/.test(v) && Number(v) > 0, 'Quantidade inválida.'),
        base: z.enum(BASES_INSUMO).default('por_unidade'),
        perdaPercentual: percentual.default('0'),
      }),
    )
    .max(100),
})
export type ProdutoInsumosInput = z.input<typeof produtoInsumosSchema>

export const produtoProcessosSchema = z.object({
  itens: z.array(z.object({ processoId: z.string().uuid(), maquinaId: uuidOpcional })).max(50),
})
export type ProdutoProcessosInput = z.input<typeof produtoProcessosSchema>

/** Simulação de preço feita pela API (que recalcula com os dados do banco). */
export const simulacaoSchema = z.object({
  quantidade: z.union([z.string(), z.number()]).transform(normalizarDecimal),
  largura: medidaOpcional,
  altura: medidaOpcional,
  acabamentoIds: z.array(z.string().uuid()).max(50).default([]),
  /** Preço negociado; se omitido usa o preço de venda do produto */
  precoUnitario: valorOpcional,
})
export type SimulacaoInput = z.input<typeof simulacaoSchema>
