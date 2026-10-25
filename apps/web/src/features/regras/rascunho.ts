import {
  acaoPadrao,
  TIPOS_REGRA,
  regraComercialSchema,
  type AcaoRegra,
  type CombinacaoRegra,
  type CondicoesRegra,
  type OrigemOrcamento,
  type RegraComercialDados,
  type RegraComercialInput,
  type TipoAcaoRegra,
  type TipoRegra,
} from '@onprint/shared'
import type { NomesRegras } from '@/api/regras'
import type { OpcaoBusca } from '@/components/shared/SearchSelect'
import { decimalParaCampo, decimalParaInput } from '@/lib/mascaras'

/*
 * Rascunho do editor de regra: os números como a pessoa digita (vírgula, sem separador de milhar nas quantidades —
 * "1000" continua 1000) e os cadastros com o nome para os chips. O schema compartilhado converte ao salvar.
 */

/** Condições que a pessoa pode pôr no "Quando" (cada uma vira um chip) */
export const CONDICOES_UI = ['produtos', 'categorias', 'quantidade', 'valorItem', 'etiquetas', 'clientes', 'valorTotal', 'pagamento', 'prazo', 'periodo', 'diasSemana', 'origens'] as const
export type CondicaoUI = (typeof CONDICOES_UI)[number]

export const CONDICAO_ROTULOS: Record<CondicaoUI, string> = {
  produtos: 'Produto',
  categorias: 'Categoria',
  quantidade: 'Quantidade do item',
  valorItem: 'Valor do item',
  etiquetas: 'Etiqueta do cliente',
  clientes: 'Cliente específico',
  valorTotal: 'Valor do orçamento',
  pagamento: 'Forma de pagamento',
  prazo: 'Prazo pedido pelo cliente',
  periodo: 'Período (datas)',
  diasSemana: 'Dia da semana',
  origens: 'De onde veio o orçamento',
}

export interface FaixaRascunho {
  minimo: string
  valor: string
}

export interface RascunhoRegra {
  id?: string
  nome: string
  ativa: boolean
  tipo: TipoRegra
  combinacao: CombinacaoRegra
  /** Condições ligadas (ordem dos chips) */
  condicoes: CondicaoUI[]
  produtos: OpcaoBusca[]
  categoriaIds: string[]
  etiquetas: string[]
  clientes: OpcaoBusca[]
  quantidadeMin: string
  quantidadeMax: string
  valorItemMin: string
  valorItemMax: string
  valorTotalMin: string
  valorTotalMax: string
  pagamento: 'a_vista' | 'parcelado'
  prazoMenorQueDias: string
  periodoInicio: string
  periodoFim: string
  diasSemana: number[]
  origens: OrigemOrcamento[]
  // ── Faça ──
  acaoTipo: TipoAcaoRegra
  modo: 'percentual' | 'valor'
  nivel: 'item' | 'orcamento'
  valor: string
  usarFaixas: boolean
  faixasPor: 'quantidade' | 'valor'
  faixas: FaixaRascunho[]
  modoMinimo: 'completar' | 'taxa'
  taxa: string
  texto: string
  produtoSugerido: OpcaoBusca | null
  obrigatorio: boolean
  avisoEquipe: string
  fraseCliente: string
}

const qtd = (v: string | number | null | undefined) => decimalParaCampo(v, 3)
const pct = (v: string | number | null | undefined) => decimalParaCampo(v, 2)
const moeda = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '' : decimalParaInput(v))

/** Ação (gravada ou padrão) → campos do rascunho; o que a ação não usa fica no padrão */
function camposDaAcao(a: AcaoRegra, nomes?: NomesRegras): Partial<RascunhoRegra> {
  const extras = { avisoEquipe: ('avisoEquipe' in a && a.avisoEquipe) || '', fraseCliente: ('fraseCliente' in a && a.fraseCliente) || '' }
  switch (a.tipo) {
    case 'desconto':
    case 'acrescimo':
      return {
        ...extras,
        modo: a.modo,
        nivel: a.nivel,
        valor: a.modo === 'percentual' ? pct(a.valor) : moeda(a.valor),
        usarFaixas: Boolean(a.faixas?.length),
        faixasPor: a.faixasPor ?? 'quantidade',
        faixas: (a.faixas ?? []).map((f) => ({
          minimo: a.faixasPor === 'valor' ? moeda(f.minimo) : qtd(f.minimo),
          valor: a.modo === 'percentual' ? pct(f.valor) : moeda(f.valor),
        })),
      }
    case 'preco_especial':
      return { ...extras, valor: moeda(a.valor) }
    case 'pedido_minimo':
      return { ...extras, valor: moeda(a.valor), modoMinimo: a.modo, taxa: moeda(a.taxa) }
    case 'sugerir_item':
      return { ...extras, texto: a.texto, obrigatorio: a.obrigatorio, produtoSugerido: a.produtoId ? { id: a.produtoId, rotulo: nomes?.produtos[a.produtoId] ?? 'Produto' } : null }
    case 'exigir_aprovacao':
    case 'bloquear':
      return { ...extras, texto: a.motivo }
    case 'aviso':
      return { fraseCliente: a.fraseCliente ?? '', texto: a.texto }
    case 'frase_cliente':
      return { texto: a.texto }
    case 'limite_negociacao':
      return { valor: pct(a.percentual) }
  }
}

const VAZIO: Omit<RascunhoRegra, 'nome' | 'acaoTipo'> = {
  ativa: true,
  tipo: 'personalizada',
  combinacao: 'soma',
  condicoes: [],
  produtos: [],
  categoriaIds: [],
  etiquetas: [],
  clientes: [],
  quantidadeMin: '',
  quantidadeMax: '',
  valorItemMin: '',
  valorItemMax: '',
  valorTotalMin: '',
  valorTotalMax: '',
  pagamento: 'a_vista',
  prazoMenorQueDias: '2',
  periodoInicio: '',
  periodoFim: '',
  diasSemana: [],
  origens: [],
  modo: 'percentual',
  nivel: 'item',
  valor: '',
  usarFaixas: false,
  faixasPor: 'quantidade',
  faixas: [],
  modoMinimo: 'completar',
  taxa: '',
  texto: '',
  produtoSugerido: null,
  obrigatorio: false,
  avisoEquipe: '',
  fraseCliente: '',
}

/** Regra gravada (ou modelo pronto já validado) → rascunho do editor */
export function rascunhoDaRegra(r: Pick<RegraComercialDados, 'nome' | 'ativa' | 'condicoes' | 'acao' | 'combinacao'> & { id?: string; tipo?: string }, nomes?: NomesRegras): RascunhoRegra {
  const c: CondicoesRegra = r.condicoes
  const ligadas: CondicaoUI[] = []
  const liga = (k: CondicaoUI, sim: unknown) => {
    if (sim) ligadas.push(k)
  }
  liga('produtos', c.produtoIds?.length)
  liga('categorias', c.categoriaIds?.length)
  liga('quantidade', c.quantidadeMin || c.quantidadeMax)
  liga('valorItem', c.valorItemMin || c.valorItemMax)
  liga('etiquetas', c.etiquetas?.length)
  liga('clientes', c.clienteIds?.length)
  liga('valorTotal', c.valorTotalMin || c.valorTotalMax)
  liga('pagamento', c.pagamento)
  liga('prazo', c.prazoMenorQueDias)
  liga('periodo', c.periodoInicio || c.periodoFim)
  liga('diasSemana', c.diasSemana?.length)
  liga('origens', c.origens?.length)
  return {
    ...VAZIO,
    id: r.id,
    nome: r.nome,
    ativa: r.ativa,
    tipo: (TIPOS_REGRA as readonly string[]).includes(r.tipo ?? '') ? (r.tipo as TipoRegra) : 'personalizada',
    combinacao: r.combinacao,
    condicoes: ligadas,
    produtos: (c.produtoIds ?? []).map((id) => ({ id, rotulo: nomes?.produtos[id] ?? 'Produto removido' })),
    categoriaIds: c.categoriaIds ?? [],
    etiquetas: c.etiquetas ?? [],
    clientes: (c.clienteIds ?? []).map((id) => ({ id, rotulo: nomes?.clientes[id] ?? 'Cliente removido' })),
    quantidadeMin: qtd(c.quantidadeMin),
    quantidadeMax: qtd(c.quantidadeMax),
    valorItemMin: moeda(c.valorItemMin),
    valorItemMax: moeda(c.valorItemMax),
    valorTotalMin: moeda(c.valorTotalMin),
    valorTotalMax: moeda(c.valorTotalMax),
    pagamento: c.pagamento ?? 'a_vista',
    prazoMenorQueDias: c.prazoMenorQueDias ? String(c.prazoMenorQueDias) : '2',
    periodoInicio: c.periodoInicio ?? '',
    periodoFim: c.periodoFim ?? '',
    diasSemana: c.diasSemana ?? [],
    origens: c.origens ?? [],
    acaoTipo: r.acao.tipo,
    ...camposDaAcao(r.acao, nomes),
  }
}

/** Regra nova do zero ("personalizada") */
export function rascunhoNovo(): RascunhoRegra {
  return rascunhoDaRegra({ nome: '', ativa: true, tipo: 'personalizada', condicoes: {}, acao: acaoPadrao('desconto'), combinacao: 'soma' })
}

/** Troca o tipo da ação: começa com os valores padrão dela (mantém aviso e frase já escritos) */
export function trocarAcao(r: RascunhoRegra, tipo: TipoAcaoRegra): RascunhoRegra {
  const novo = { ...r, acaoTipo: tipo, faixas: [], usarFaixas: false, ...camposDaAcao(acaoPadrao(tipo)) }
  return { ...novo, avisoEquipe: r.avisoEquipe || novo.avisoEquipe, fraseCliente: r.fraseCliente || novo.fraseCliente }
}

const ou = (v: string) => (v.trim() ? v : null)

/** Rascunho → corpo da API (o schema compartilhado valida e normaliza "1.234,56", "1000" e "0,30") */
export function regraDoRascunho(r: RascunhoRegra): RegraComercialInput {
  const tem = (k: CondicaoUI) => r.condicoes.includes(k)
  const condicoes: RegraComercialInput['condicoes'] = {
    produtoIds: tem('produtos') ? r.produtos.map((p) => p.id) : undefined,
    categoriaIds: tem('categorias') ? r.categoriaIds : undefined,
    etiquetas: tem('etiquetas') ? r.etiquetas : undefined,
    clienteIds: tem('clientes') ? r.clientes.map((c) => c.id) : undefined,
    quantidadeMin: tem('quantidade') ? ou(r.quantidadeMin) : null,
    quantidadeMax: tem('quantidade') ? ou(r.quantidadeMax) : null,
    valorItemMin: tem('valorItem') ? ou(r.valorItemMin) : null,
    valorItemMax: tem('valorItem') ? ou(r.valorItemMax) : null,
    valorTotalMin: tem('valorTotal') ? ou(r.valorTotalMin) : null,
    valorTotalMax: tem('valorTotal') ? ou(r.valorTotalMax) : null,
    pagamento: tem('pagamento') ? r.pagamento : null,
    prazoMenorQueDias: tem('prazo') ? (ou(r.prazoMenorQueDias) as unknown as number) : null,
    periodoInicio: tem('periodo') ? ou(r.periodoInicio) : null,
    periodoFim: tem('periodo') ? ou(r.periodoFim) : null,
    diasSemana: tem('diasSemana') ? r.diasSemana : undefined,
    origens: tem('origens') ? r.origens : undefined,
  }
  const extras = { avisoEquipe: ou(r.avisoEquipe), fraseCliente: ou(r.fraseCliente) }
  let acao: RegraComercialInput['acao']
  switch (r.acaoTipo) {
    case 'desconto':
    case 'acrescimo':
      acao = {
        tipo: r.acaoTipo,
        modo: r.modo,
        nivel: r.nivel,
        // Com faixas, o valor solto não vale (fica o que estava, para voltar a ele se as faixas saírem)
        valor: r.usarFaixas ? r.valor || '0' : r.valor,
        ...(r.usarFaixas ? { faixasPor: r.faixasPor, faixas: r.faixas.filter((f) => f.minimo.trim() || f.valor.trim()) } : {}),
        ...extras,
      }
      break
    case 'preco_especial':
      acao = { tipo: 'preco_especial', valor: r.valor, ...extras }
      break
    case 'pedido_minimo':
      acao = { tipo: 'pedido_minimo', valor: r.valor, modo: r.modoMinimo, taxa: r.modoMinimo === 'taxa' ? ou(r.taxa) : null, ...extras }
      break
    case 'sugerir_item':
      acao = { tipo: 'sugerir_item', texto: r.texto, produtoId: r.produtoSugerido?.id ?? null, obrigatorio: r.obrigatorio, ...extras }
      break
    case 'exigir_aprovacao':
    case 'bloquear':
      acao = { tipo: r.acaoTipo, motivo: r.texto, ...extras }
      break
    case 'aviso':
      acao = { tipo: 'aviso', texto: r.texto, fraseCliente: extras.fraseCliente }
      break
    case 'frase_cliente':
      acao = { tipo: 'frase_cliente', texto: r.texto }
      break
    case 'limite_negociacao':
      acao = { tipo: 'limite_negociacao', percentual: r.valor }
      break
  }
  return { nome: r.nome, ativa: r.ativa, tipo: r.tipo, condicoes, acao, combinacao: r.combinacao }
}

/** Valida o rascunho como a API vai validar: a regra pronta ou a primeira mensagem de erro */
export function validarRascunho(r: RascunhoRegra): { ok: true; regra: RegraComercialDados } | { ok: false; erro: string } {
  const v = regraComercialSchema.safeParse(regraDoRascunho(r))
  return v.success ? { ok: true, regra: v.data } : { ok: false, erro: v.error.issues[0]?.message ?? 'Confira os campos da regra.' }
}
