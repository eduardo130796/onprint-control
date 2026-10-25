import { z } from 'zod'
import { normalizarDecimal, textoOpcional, valorMonetario } from './campos'

/*
 * Regras comerciais (Configurações → Regras comerciais): o dono ensina o sistema como um estagiário — "Quando…"
 * (condições, todas opcionais e somadas com E) e "Faça…" (uma ação, mais um aviso para a equipe e uma frase para o
 * cliente opcionais). Quem aplica é sempre o sistema (motor em regras-comerciais.ts), nunca a IA.
 */

/** De onde veio o orçamento: balcão/sistema, vitrine (pedido do site), Assistente GrafyGo ou WhatsApp */
export const ORIGENS_ORCAMENTO = ['balcao', 'vitrine', 'assistente', 'whatsapp'] as const
export type OrigemOrcamento = (typeof ORIGENS_ORCAMENTO)[number]

export const ORIGEM_ORCAMENTO_ROTULOS: Record<OrigemOrcamento, string> = {
  balcao: 'Balcão / sistema',
  vitrine: 'Vitrine (site)',
  assistente: 'Assistente GrafyGo',
  whatsapp: 'WhatsApp',
}

/** Modelos prontos (um clique cria a regra preenchida) ou "personalizada" */
export const PRESETS_REGRA = ['desconto_quantidade', 'desconto_valor', 'desconto_a_vista', 'cliente_especial', 'urgencia', 'pedido_minimo', 'limite_negociacao'] as const
export type PresetRegra = (typeof PRESETS_REGRA)[number]
export const TIPOS_REGRA = [...PRESETS_REGRA, 'personalizada'] as const
export type TipoRegra = (typeof TIPOS_REGRA)[number]

export const TIPOS_ACAO_REGRA = [
  'desconto',
  'acrescimo',
  'preco_especial',
  'pedido_minimo',
  'sugerir_item',
  'exigir_aprovacao',
  'bloquear',
  'aviso',
  'frase_cliente',
  'limite_negociacao',
] as const
export type TipoAcaoRegra = (typeof TIPOS_ACAO_REGRA)[number]

export const TIPO_ACAO_ROTULOS: Record<TipoAcaoRegra, string> = {
  desconto: 'Dar desconto',
  acrescimo: 'Cobrar acréscimo',
  preco_especial: 'Preço especial',
  pedido_minimo: 'Valor mínimo do pedido',
  sugerir_item: 'Sugerir ou exigir um item',
  exigir_aprovacao: 'Exigir aprovação de um gerente',
  bloquear: 'Bloquear o envio',
  aviso: 'Aviso para a equipe',
  frase_cliente: 'Frase para o cliente',
  limite_negociacao: 'Limite de negociação',
}

/** Como um desconto convive com os outros: soma (acumula) ou "maior vence" (não acumula; vale o maior) */
export const COMBINACOES_REGRA = ['soma', 'maior'] as const
export type CombinacaoRegra = (typeof COMBINACOES_REGRA)[number]

export const DIAS_SEMANA_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (AAAA-MM-DD).')
const vazioParaNull = (v: unknown) => (v === '' || v === undefined ? null : v)
const opcional = <T extends z.ZodType>(t: T) => z.preprocess(vazioParaNull, t.nullable().optional())

/** Quantidade (peças, horas, unidades no milheiro) com até 3 casas */
const quantidadeRegra = z
  .union([z.string(), z.number()])
  .transform(normalizarDecimal)
  .refine((v) => /^\d{1,9}(\.\d{1,3})?$/.test(v), 'Quantidade inválida.')

const percentualRegra = z
  .union([z.string(), z.number()])
  .transform(normalizarDecimal)
  .refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) > 0 && Number(v) <= 100, 'Percentual entre 0,01 e 100.')

const valorPositivo = valorMonetario.refine((v) => Number(v) > 0, 'Informe um valor maior que zero.')
const textoCurto = (max: number, msg: string) => z.string().trim().min(2, msg).max(max)
const listaIds = z.array(z.string().uuid()).max(200)

export const condicoesRegraSchema = z
  .object({
    produtoIds: listaIds.optional(),
    categoriaIds: listaIds.optional(),
    /** O cliente tem alguma destas etiquetas (sem diferença de maiúsculas e acentos) */
    etiquetas: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
    clienteIds: listaIds.optional(),
    /** Quantidade do item (peças; no milheiro, unidades) */
    quantidadeMin: opcional(quantidadeRegra),
    quantidadeMax: opcional(quantidadeRegra),
    /** Valor do item antes das regras e dos descontos manuais */
    valorItemMin: opcional(valorMonetario),
    valorItemMax: opcional(valorMonetario),
    /** Soma dos itens antes das regras e dos descontos manuais */
    valorTotalMin: opcional(valorMonetario),
    valorTotalMax: opcional(valorMonetario),
    /** À vista = entrada de 100% no pagamento combinado do orçamento */
    pagamento: opcional(z.enum(['a_vista', 'parcelado'])),
    /** Prazo pedido pelo cliente: faltam menos de N dias úteis até a data desejada */
    prazoMenorQueDias: opcional(z.coerce.number().int().min(1, 'Prazo entre 1 e 60 dias úteis.').max(60, 'Prazo entre 1 e 60 dias úteis.')),
    periodoInicio: opcional(dataISO),
    periodoFim: opcional(dataISO),
    /** 0 = domingo … 6 = sábado */
    diasSemana: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    origens: z.array(z.enum(ORIGENS_ORCAMENTO)).max(ORIGENS_ORCAMENTO.length).optional(),
  })
  .refine((c) => !c.periodoInicio || !c.periodoFim || c.periodoInicio <= c.periodoFim, { message: 'O fim do período é antes do início.', path: ['periodoFim'] })
  .refine((c) => !c.quantidadeMin || !c.quantidadeMax || Number(c.quantidadeMin) <= Number(c.quantidadeMax), { message: 'Quantidade mínima maior que a máxima.', path: ['quantidadeMax'] })
  .transform((c) => {
    // Guarda só o que vale: listas vazias e campos em branco saem (o JSON fica limpo e a descrição também)
    const limpo: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(c)) if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) limpo[k] = Array.isArray(v) ? [...new Set(v as unknown[])] : v
    return limpo as typeof c
  })
export type CondicoesRegra = z.output<typeof condicoesRegraSchema>

/** Texto opcional que acompanha qualquer ação: aviso para a equipe e frase para o cliente ({valor} = o desconto) */
const extras = {
  avisoEquipe: textoOpcional,
  fraseCliente: textoOpcional,
}

const faixaSchema = z.object({ minimo: z.union([z.string(), z.number()]).transform(normalizarDecimal).refine((v) => /^\d{1,10}(\.\d{1,3})?$/.test(v), 'Faixa inválida.'), valor: z.union([z.string(), z.number()]).transform(normalizarDecimal) })

const descontoOuAcrescimo = {
  modo: z.enum(['percentual', 'valor']),
  /** % ou R$ (por item, no nível item; no orçamento, uma vez) */
  valor: z.union([z.string(), z.number()]).transform(normalizarDecimal),
  nivel: z.enum(['item', 'orcamento']),
  /** Faixas ("a partir de 100 un: 5%; de 500: 10%"): vale a maior faixa alcançada; sem faixa alcançada, não aplica */
  faixas: z.array(faixaSchema).max(10).optional(),
  /** O que as faixas medem: quantidade do item ou valor (do item ou dos itens que a regra pega) */
  faixasPor: z.enum(['quantidade', 'valor']).optional(),
  ...extras,
}

/** Confere o valor de desconto/acréscimo e das faixas conforme o modo (% até 100; R$ com 2 casas) */
function validarValor(modo: 'percentual' | 'valor', v: string) {
  return modo === 'percentual' ? percentualRegra.safeParse(v).success : valorPositivo.safeParse(v).success
}

export const acaoRegraSchema = z
  .discriminatedUnion('tipo', [
    z.object({ tipo: z.literal('desconto'), ...descontoOuAcrescimo }),
    z.object({ tipo: z.literal('acrescimo'), ...descontoOuAcrescimo }),
    /** Preço por unidade de cálculo do produto (unidade, m², metro, milheiro, hora): troca o preço de tabela */
    z.object({ tipo: z.literal('preco_especial'), valor: valorPositivo, ...extras }),
    /** Abaixo do mínimo: completa até o mínimo ou cobra uma taxa fixa */
    z.object({ tipo: z.literal('pedido_minimo'), valor: valorPositivo, modo: z.enum(['completar', 'taxa']), taxa: z.preprocess(vazioParaNull, valorMonetario.nullable().optional()), ...extras }),
    /** "Oferecer criação de arte": aparece como sugestão (nunca entra sozinho); obrigatório = faltando, exige aprovação */
    z.object({ tipo: z.literal('sugerir_item'), texto: textoCurto(200, 'Escreva a sugestão.'), produtoId: z.preprocess(vazioParaNull, z.string().uuid().nullable().optional()), obrigatorio: z.boolean().default(false), ...extras }),
    z.object({ tipo: z.literal('exigir_aprovacao'), motivo: textoCurto(300, 'Explique o motivo.'), ...extras }),
    z.object({ tipo: z.literal('bloquear'), motivo: textoCurto(300, 'Explique o motivo.'), ...extras }),
    z.object({ tipo: z.literal('aviso'), texto: textoCurto(500, 'Escreva o aviso.'), fraseCliente: textoOpcional }),
    z.object({ tipo: z.literal('frase_cliente'), texto: textoCurto(300, 'Escreva a frase.') }),
    /** Desconto manual máximo (% sobre o valor já com as regras) que quem não é gerente pode dar */
    z.object({ tipo: z.literal('limite_negociacao'), percentual: z.union([z.string(), z.number()]).transform(normalizarDecimal).refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 100, 'Percentual entre 0 e 100.') }),
  ])
  .superRefine((a, ctx) => {
    if (a.tipo !== 'desconto' && a.tipo !== 'acrescimo') return
    if (a.faixas?.length) {
      if (!a.faixasPor) ctx.addIssue({ code: 'custom', message: 'Diga se as faixas são por quantidade ou por valor.', path: ['faixasPor'] })
      if (a.faixasPor === 'quantidade' && a.nivel === 'orcamento') ctx.addIssue({ code: 'custom', message: 'Faixas por quantidade valem por item.', path: ['faixasPor'] })
      a.faixas.forEach((f, i) => {
        if (!validarValor(a.modo, f.valor)) ctx.addIssue({ code: 'custom', message: a.modo === 'percentual' ? 'Percentual da faixa entre 0,01 e 100.' : 'Valor da faixa inválido.', path: ['faixas', i, 'valor'] })
      })
      const minimos = a.faixas.map((f) => Number(f.minimo))
      if (new Set(minimos).size !== minimos.length) ctx.addIssue({ code: 'custom', message: 'Há faixas repetidas.', path: ['faixas'] })
    } else if (!validarValor(a.modo, a.valor)) {
      ctx.addIssue({ code: 'custom', message: a.modo === 'percentual' ? 'Percentual entre 0,01 e 100.' : 'Informe um valor maior que zero.', path: ['valor'] })
    }
  })
  .superRefine((a, ctx) => {
    if (a.tipo === 'pedido_minimo' && a.modo === 'taxa' && !(a.taxa && Number(a.taxa) > 0)) ctx.addIssue({ code: 'custom', message: 'Informe a taxa.', path: ['taxa'] })
  })
export type AcaoRegra = z.output<typeof acaoRegraSchema>
export type AcaoRegraInput = z.input<typeof acaoRegraSchema>

export const regraComercialSchema = z.object({
  nome: z.string().trim().min(2, 'Dê um nome à regra.').max(120),
  ativa: z.boolean().default(true),
  tipo: z.enum(TIPOS_REGRA).default('personalizada'),
  condicoes: condicoesRegraSchema.default({}),
  acao: acaoRegraSchema,
  combinacao: z.enum(COMBINACOES_REGRA).default('soma'),
})
export type RegraComercialInput = z.input<typeof regraComercialSchema>
export type RegraComercialDados = z.output<typeof regraComercialSchema>

/** Liga/desliga sem mexer no resto */
export const regraAtivaSchema = z.object({ ativa: z.boolean() })
/** Nova ordem (prioridade) de todas as regras: a primeira vale primeiro */
export const ordemRegrasSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) })

/** Manual do atendente: orientações livres para o Assistente (não mexem em preço) */
export const manualAtendenteSchema = z.object({ manualAtendente: z.preprocess(vazioParaNull, z.string().trim().max(4000, 'Até 4.000 caracteres.').nullable()) })

/** Simulador (e o contexto do editor): produtos, quantidades, cliente, pagamento, data e origem */
export const simulacaoRegrasSchema = z.object({
  clienteId: z.preprocess(vazioParaNull, z.string().uuid().nullable().optional()),
  itens: z
    .array(
      z.object({
        produtoId: z.string().uuid('Escolha o produto.'),
        quantidade: quantidadeRegra.refine((v) => Number(v) > 0, 'Quantidade inválida.'),
        largura: z.preprocess(vazioParaNull, z.union([z.string(), z.number()]).transform(normalizarDecimal).nullable().optional()),
        altura: z.preprocess(vazioParaNull, z.union([z.string(), z.number()]).transform(normalizarDecimal).nullable().optional()),
      }),
    )
    .min(1, 'Escolha ao menos um produto.')
    .max(20),
  sinalPercentual: z.union([z.string(), z.number()]).transform(normalizarDecimal).default('50'),
  parcelas: z.coerce.number().int().min(0).max(24).default(1),
  dataDesejada: z.preprocess(vazioParaNull, dataISO.nullable().optional()),
  /** Data do orçamento (hoje, se vazio): para testar período e dia da semana */
  data: z.preprocess(vazioParaNull, dataISO.nullable().optional()),
  origem: z.enum(ORIGENS_ORCAMENTO).default('balcao'),
  descontoManual: z.preprocess(vazioParaNull, valorMonetario.nullable().optional()),
})
export type SimulacaoRegrasInput = z.input<typeof simulacaoRegrasSchema>
