import { z } from 'zod'
import { BASES_EXTRA, BASES_TEMPO, MODOS_RATEIO, TIPOS_EMBALAGEM, type CustoItem, type PercentuaisPreco, type SituacaoLucro, type TipoEmbalagem, type ModoRateio } from '../custos'
import { BASES_INSUMO, type BaseInsumo, type ModoCalculo } from '../enums'
import { paginacaoQuerySchema } from './comum'
import { decimal3, normalizarDecimal, percentual, textoOpcional, uuidOpcional, valorMonetario } from './campos'

/** Decimal positivo com até `casas` casas; vazio vira null quando opcional. */
const decimalCasas = (casas: number, msg = 'Valor inválido.') =>
  z
    .union([z.string(), z.number()])
    .transform(normalizarDecimal)
    .refine((v) => new RegExp(`^\\d{1,9}(\\.\\d{1,${casas}})?$`).test(v), msg)
const opcional = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' || v === null || v === undefined ? null : v), s.nullable().optional())

export const MODOS_CUSTO = ['simples', 'composicao'] as const
export type ModoCusto = (typeof MODOS_CUSTO)[number]
export const MODO_CUSTO_ROTULOS: Record<ModoCusto, string> = { simples: 'Sei meu custo', composicao: 'Montar a composição' }

/** Unidade em que o insumo é usado na produção (define a conversão da embalagem) */
export const USOS_INSUMO = ['m2', 'm', 'outra'] as const

// ─── Insumos (Produtos → Insumos) ───────────────────────────────────────────

/**
 * Insumo/material: o que a gráfica compra para produzir (lona, tinta, ilhós, chapa…). Guardado como produto
 * do tipo "insumo", mas com tela própria. O custo por unidade de uso sai da embalagem (rolo 3,20 × 50 m por
 * R$ 1.450 → R$ 9,06/m²) e depois acompanha o custo médio das compras.
 */
export const insumoSchema = z
  .object({
    codigo: z.preprocess((v) => (typeof v === 'string' && !v.trim() ? null : v), z.string().trim().toUpperCase().max(30).nullable().optional()),
    nome: z.string().trim().min(2, 'Informe o nome.').max(160),
    descricao: textoOpcional,
    categoriaId: uuidOpcional,
    /** Unidade de uso (m², m, folha, un, l, kg…) */
    unidadeMedidaId: z.string().uuid('Escolha a unidade de uso.'),
    embalagem: z.enum(TIPOS_EMBALAGEM).default('unidade'),
    embalagemLargura: opcional(decimalCasas(3, 'Largura inválida (em metros).')),
    embalagemComprimento: opcional(decimalCasas(3, 'Comprimento inválido (em metros).')),
    /** Pacote/caixa/galão: quantas unidades de uso vêm */
    embalagemConteudo: opcional(decimalCasas(3, 'Quantidade inválida.')),
    /** Preço pago pela embalagem (última compra) */
    precoEmbalagem: opcional(valorMonetario),
    fornecedorPreferidoId: uuidOpcional,
    controlaEstoque: z.boolean().default(true),
    estoqueMinimo: decimal3.default('0'),
    ativo: z.boolean().default(true),
  })
  .refine((i) => !['rolo', 'chapa'].includes(i.embalagem) || (i.embalagemLargura && i.embalagemComprimento), {
    message: 'Informe largura e comprimento da embalagem.',
    path: ['embalagemComprimento'],
  })
export type InsumoInput = z.input<typeof insumoSchema>

export const insumosQuerySchema = paginacaoQuerySchema.extend({
  ativo: z.enum(['true', 'false', 'todos']).default('true'),
  categoriaId: z.string().uuid().optional(),
  /** Só os abaixo do estoque mínimo */
  abaixoMinimo: z.enum(['true', 'false']).optional(),
})
export type InsumosQuery = z.input<typeof insumosQuerySchema>

export interface InsumoResumo {
  id: string
  codigo: string
  nome: string
  categoria: { id: string; nome: string } | null
  unidadeMedida: { id: string; sigla: string; nome: string } | null
  embalagem: TipoEmbalagem
  /** Custo por unidade de uso (4 casas) — só para quem vê custos */
  custo?: string
  precoEmbalagem?: string | null
  controlaEstoque: boolean
  estoqueMinimo: string
  /** Saldo somado dos locais (null se não controla estoque) */
  saldo: string | null
  abaixoMinimo: boolean
  /** Em quantos produtos o insumo é usado */
  usadoEm: number
  ativo: boolean
}

export interface InsumoDetalhe extends InsumoResumo {
  descricao: string | null
  categoriaId: string | null
  unidadeMedidaId: string | null
  embalagemLargura: string | null
  embalagemComprimento: string | null
  embalagemConteudo: string | null
  fornecedorPreferidoId: string | null
  fornecedorPreferido: { id: string; nome: string } | null
  /** Custo médio das compras (consolidado dos locais) e quando mudou */
  custoMedio?: string | null
  /** Produtos que usam este insumo (com o custo de referência e a situação do lucro) */
  produtos: { id: string; codigo: string; nome: string; quantidade: string; base: BaseInsumo; situacao?: SituacaoLucro }[]
}

// ─── Composição de custo do produto ─────────────────────────────────────────

export const composicaoProdutoSchema = z.object({
  modoCusto: z.enum(MODOS_CUSTO),
  /** Modo simples: custo por unidade de cálculo digitado */
  custoManual: opcional(decimalCasas(4)),
  materiais: z
    .array(
      z.object({
        insumoId: z.string().uuid(),
        quantidade: decimalCasas(4, 'Quantidade inválida.').refine((v) => Number(v) > 0, 'Quantidade inválida.'),
        base: z.enum(BASES_INSUMO).default('por_m2'),
        perdaPercentual: percentual.default('0'),
      }),
    )
    .max(100)
    .default([]),
  producao: z
    .array(
      z.object({
        processoId: z.string().uuid(),
        maquinaId: uuidOpcional,
        /** Minutos por base; vazio = velocidade da máquina (por m²) ou tempo padrão do processo */
        minutos: opcional(decimalCasas(2)),
        base: z.enum(BASES_TEMPO).default('por_unidade'),
        setupMinutos: decimalCasas(2).default('0'),
      }),
    )
    .max(50)
    .default([]),
  extras: z
    .array(z.object({ nome: z.string().trim().min(2, 'Descreva o custo.').max(80), valor: decimalCasas(4), base: z.enum(BASES_EXTRA).default('por_item') }))
    .max(30)
    .default([]),
  /** % sobre o preço; vazio = padrão da empresa */
  lucroDesejado: opcional(percentual),
  lucroMinimo: opcional(percentual),
  precoVenda: valorMonetario,
  precoMinimo: opcional(valorMonetario),
})
export type ComposicaoProdutoInput = z.input<typeof composicaoProdutoSchema>

/** Parâmetros de preço da empresa já resolvidos (para a tela calcular ao vivo) */
export interface ParametrosPreco {
  percentuais: PercentuaisPreco
  custoFixoHora: string
  lucroDesejadoPadrao: string
  lucroMinimoPadrao: string
}

export interface ComposicaoProdutoDetalhe {
  produtoId: string
  modoCalculo: ModoCalculo
  larguraPadrao: string | null
  alturaPadrao: string | null
  modoCusto: ModoCusto
  custoManual: string | null
  materiais: {
    insumoId: string
    codigo: string
    nome: string
    unidade: string
    /** Custo atual do insumo por unidade de uso */
    custoUnitario: string
    quantidade: string
    base: BaseInsumo
    perdaPercentual: string
  }[]
  producao: {
    processoId: string
    nome: string
    maquinaId: string | null
    maquinaNome: string | null
    /** Custo/hora usado: o da máquina (se > 0) ou o do processo */
    custoHora: string
    velocidadeM2Hora: string | null
    tempoPadraoMinutos: number | null
    minutos: string | null
    base: (typeof BASES_TEMPO)[number]
    setupMinutos: string
  }[]
  extras: { nome: string; valor: string; base: (typeof BASES_EXTRA)[number] }[]
  lucroDesejado: string | null
  lucroMinimo: string | null
  precoVenda: string
  precoMinimo: string | null
  /** Custo por unidade de cálculo (o que fica gravado no produto) e o detalhamento */
  referencia: CustoItem & { porUnidade: string; unidade: string }
  parametros: ParametrosPreco
  /** Lucro do preço atual */
  analise: { lucro: string; lucroPercentual: string; despesasSobrePreco: string; situacao: SituacaoLucro }
  precoSugerido: string | null
  /** Quando o custo foi recalculado pela última vez */
  custoCalculadoEm: string | null
}

// ─── Configuração de preço da empresa (Configurações → Precificação) ─────────

export const precificacaoSchema = z.object({
  impostosPercentual: percentual.default('0'),
  comissaoPercentual: percentual.default('0'),
  rateioModo: z.enum(MODOS_RATEIO).default('nenhum'),
  custoFixoPercentual: percentual.default('0'),
  custoFixoMensal: valorMonetario.default('0'),
  horasProdutivasMes: z.coerce.number().int().min(0).max(744).default(0),
  lucroDesejadoPadrao: percentual.default('30'),
  lucroMinimoPadrao: percentual.default('15'),
})
export type PrecificacaoInput = z.input<typeof precificacaoSchema>

export interface Precificacao {
  impostosPercentual: string
  comissaoPercentual: string
  rateioModo: ModoRateio
  custoFixoPercentual: string
  custoFixoMensal: string
  horasProdutivasMes: number
  lucroDesejadoPadrao: string
  lucroMinimoPadrao: string
  /** Calculado: custo fixo por hora de produção */
  custoFixoHora: string
}

// ─── Lucro no orçamento e no pedido (fase 3) ─────────────────────────────────

/**
 * Análise de um item (ou do total) do orçamento/pedido. TODO usuário recebe a `situacao` (semáforo); os números
 * (custo, lucro, linhas) só vêm para quem vê custos — o vendedor nunca recebe o custo, nem no navegador.
 */
export interface AnaliseLucro {
  situacao: SituacaoLucro
  custoDireto?: string
  lucro?: string
  lucroPercentual?: string
  despesasSobrePreco?: string
  /** Detalhamento (produto/materiais/produção/rateio/extras/acabamentos) */
  linhas?: CustoItem['linhas']
}

/** POST /orcamentos/analisar: mesmos itens do orçamento (orcamentoItemSchema) → semáforo por item e do total */
export interface AnaliseOrcamento {
  itens: AnaliseLucro[]
  total: AnaliseLucro
}

// ─── Relatório de lucratividade (fase 3) ─────────────────────────────────────

export const lucratividadeQuerySchema = z.object({
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  agrupar: z.enum(['pedido', 'produto']).default('pedido'),
})
export type LucratividadeQuery = z.input<typeof lucratividadeQuerySchema>

export interface LinhaLucratividade {
  /** Pedido: id/número/cliente; produto: id/código/nome */
  id: string
  titulo: string
  subtitulo: string | null
  receita: string
  /** Custo direto estimado na venda (guardado no item) */
  custoEstimado: string
  /** Materiais efetivamente consumidos (baixas de estoque ligadas ao pedido, ao custo médio do momento) */
  custoMateriaisReal: string | null
  /** Impostos + comissão + custo fixo % sobre a receita */
  despesas: string
  lucro: string
  lucroPercentual: string
  situacao: SituacaoLucro
}

export interface RelatorioLucratividade {
  linhas: LinhaLucratividade[]
  /** Receita e custos de todas as linhas; lucro, % e situação só das que têm custo informado */
  totais: Omit<LinhaLucratividade, 'id' | 'titulo' | 'subtitulo'>
  /** Vendas sem custo informado: ficam fora do lucro total (senão pareceriam 100% de lucro) */
  semCusto: { quantidade: number; receita: string }
}

// ─── Reajuste de preços ────────────────────────────────────────────────────

export const reajusteQuerySchema = z.object({ situacao: z.enum(['abaixo', 'todos']).default('abaixo') })

export interface ProdutoReajuste {
  id: string
  codigo: string
  nome: string
  modoCalculo: ModoCalculo
  unidade: string
  custo: string
  precoVenda: string
  lucroPercentual: string
  situacao: SituacaoLucro
  precoSugerido: string | null
  lucroDesejado: string
}

export const aplicarReajusteSchema = z.object({
  itens: z.array(z.object({ id: z.string().uuid(), precoVenda: valorMonetario })).min(1).max(500),
})
export type AplicarReajusteInput = z.input<typeof aplicarReajusteSchema>
