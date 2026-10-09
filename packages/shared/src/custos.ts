import Decimal from 'decimal.js'
import type { BaseInsumo, ModoCalculo, TipoCobranca } from './enums'

/**
 * Custo e preço dos produtos (composição de custo). Regras puras, usadas pela API (custo de referência,
 * reajuste, orçamento) e pela tela (resumo ao vivo):
 * - custo direto = materiais (insumos × consumo × perda) + produção (tempo × custo/hora da máquina ou do
 *   processo, + preparo) + rateio por hora de produção + extras (embalagem…);
 * - percentuais sobre o PREÇO (impostos, comissão, custo fixo em %, lucro): preço = custo direto ÷ (1 − soma%);
 * - medidas reais (sem a área mínima de cobrança), como a baixa de estoque.
 */

type Valor = string | number | null | undefined
const dec = (v: Valor) => new Decimal(v === null || v === undefined || v === '' ? 0 : v)
const reais = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)

// ─── Unidades de compra → unidade de uso (insumos) ──────────────────────────

/** Como o insumo é comprado: dá a quantidade de "unidade de uso" em cada embalagem. */
export const TIPOS_EMBALAGEM = ['rolo', 'chapa', 'pacote', 'caixa', 'galao', 'unidade'] as const
export type TipoEmbalagem = (typeof TIPOS_EMBALAGEM)[number]
export const TIPO_EMBALAGEM_ROTULOS: Record<TipoEmbalagem, string> = {
  rolo: 'Rolo',
  chapa: 'Chapa',
  pacote: 'Pacote',
  caixa: 'Caixa',
  galao: 'Galão / frasco',
  unidade: 'Unidade avulsa',
}

export interface CompraInsumo {
  embalagem: TipoEmbalagem
  /** Rolo/chapa: largura e comprimento em metros (rolo 3,20 × 50; chapa 1,22 × 2,44) */
  largura?: Valor
  comprimento?: Valor
  /** Pacote/caixa/galão: quantas unidades de uso vêm (500 folhas, 1000 ilhoses, 5 litros) */
  conteudo?: Valor
}

/**
 * Quantas unidades de uso vêm em uma embalagem. Rolo e chapa: m² (largura × comprimento) se a unidade de
 * uso é m², ou metros (comprimento) se é metro linear; demais: o conteúdo informado. 0 = não dá para saber.
 */
export function fatorEmbalagem(compra: CompraInsumo, unidadeUso: 'm2' | 'm' | 'outra'): number {
  if (compra.embalagem === 'unidade') return 1
  if (compra.embalagem === 'rolo' || compra.embalagem === 'chapa') {
    if (unidadeUso === 'm2') return dec(compra.largura).mul(dec(compra.comprimento)).toNumber()
    if (unidadeUso === 'm') return dec(compra.comprimento).toNumber()
  }
  return dec(compra.conteudo).toNumber()
}

/** Custo por unidade de uso (4 casas): preço da embalagem ÷ fator. */
export function custoPorUnidadeDeUso(precoEmbalagem: Valor, fator: number): string | null {
  if (!(fator > 0)) return null
  return dec(precoEmbalagem).div(fator).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4)
}

// ─── Composição ────────────────────────────────────────────────────────────

/** Base do tempo de produção: por peça, por m², por metro, ou uma vez por item do orçamento (ex.: preparo) */
export const BASES_TEMPO = ['por_unidade', 'por_m2', 'por_metro_linear', 'por_item'] as const
export type BaseTempo = (typeof BASES_TEMPO)[number]
export const BASES_EXTRA = ['por_unidade', 'por_m2', 'por_metro_linear', 'por_item'] as const
export type BaseExtra = (typeof BASES_EXTRA)[number]

export interface MaterialComposicao {
  nome: string
  /** Custo do insumo por unidade de uso */
  custoUnitario: Valor
  unidade?: string
  quantidade: Valor
  base: BaseInsumo
  perdaPercentual: Valor
}

export interface ProducaoComposicao {
  nome: string
  /** Custo por hora da máquina (ou do processo, sem máquina) */
  custoHora: Valor
  /** Minutos por base; sem minutos e com base por m², usa a velocidade da máquina */
  minutos: Valor
  base: BaseTempo
  /** Preparo (acerto) por item do orçamento */
  setupMinutos: Valor
  velocidadeM2Hora?: Valor
}

export interface ExtraComposicao {
  nome: string
  valor: Valor
  base: BaseExtra
}

export interface Composicao {
  materiais: MaterialComposicao[]
  producao: ProducaoComposicao[]
  extras: ExtraComposicao[]
}

export interface MedidasItem {
  quantidade: Valor
  /** Metros */
  largura?: Valor
  altura?: Valor
}

export interface LinhaCusto {
  grupo: 'material' | 'producao' | 'rateio' | 'extra' | 'produto' | 'acabamento'
  nome: string
  /** Quantidade consumida (material: na unidade de uso; produção: minutos) */
  quantidade: string
  unidade: string
  valor: string
}

export interface CustoItem {
  materiais: string
  producao: string
  rateio: string
  extras: string
  custoDireto: string
  minutosProducao: string
  linhas: LinhaCusto[]
}

function baseDoItem(base: BaseInsumo | BaseTempo | BaseExtra, m: MedidasItem): Decimal {
  const pecas = dec(m.quantidade)
  const largura = dec(m.largura)
  const altura = dec(m.altura)
  switch (base) {
    case 'por_m2':
      return largura.mul(altura).mul(pecas)
    case 'por_metro_linear':
      return largura.mul(pecas)
    case 'por_item':
      return new Decimal(1)
    default:
      return pecas
  }
}

/**
 * Custo direto de um item com as medidas reais. `custoFixoHora` (rateio por hora de produção) entra por
 * minuto de produção; o rateio em % fica nos percentuais do preço.
 */
export function calcularCustoItem(c: Composicao, medidas: MedidasItem, opcoes: { custoFixoHora?: Valor } = {}): CustoItem {
  const linhas: LinhaCusto[] = []
  let materiais = new Decimal(0)
  for (const m of c.materiais) {
    const qtd = baseDoItem(m.base, medidas).mul(dec(m.quantidade)).mul(dec(1).plus(dec(m.perdaPercentual).div(100)))
    const valor = qtd.mul(dec(m.custoUnitario))
    materiais = materiais.plus(valor)
    linhas.push({ grupo: 'material', nome: m.nome, quantidade: qtd.toDecimalPlaces(3).toFixed(3), unidade: m.unidade ?? '', valor: reais(valor) })
  }
  let producao = new Decimal(0)
  let minutosTotal = new Decimal(0)
  for (const p of c.producao) {
    let porBase = dec(p.minutos)
    if (porBase.lte(0) && p.base === 'por_m2' && dec(p.velocidadeM2Hora).gt(0)) porBase = new Decimal(60).div(dec(p.velocidadeM2Hora))
    const minutos = baseDoItem(p.base, medidas).mul(porBase).plus(dec(p.setupMinutos))
    const valor = minutos.div(60).mul(dec(p.custoHora))
    minutosTotal = minutosTotal.plus(minutos)
    producao = producao.plus(valor)
    linhas.push({ grupo: 'producao', nome: p.nome, quantidade: minutos.toDecimalPlaces(1).toFixed(1), unidade: 'min', valor: reais(valor) })
  }
  const rateio = minutosTotal.div(60).mul(dec(opcoes.custoFixoHora))
  if (rateio.gt(0)) linhas.push({ grupo: 'rateio', nome: 'Custos fixos (por hora de produção)', quantidade: minutosTotal.toDecimalPlaces(1).toFixed(1), unidade: 'min', valor: reais(rateio) })
  let extras = new Decimal(0)
  for (const e of c.extras) {
    const valor = baseDoItem(e.base, medidas).mul(dec(e.valor))
    extras = extras.plus(valor)
    linhas.push({ grupo: 'extra', nome: e.nome, quantidade: baseDoItem(e.base, medidas).toDecimalPlaces(3).toFixed(3), unidade: '', valor: reais(valor) })
  }
  const custoDireto = materiais.plus(producao).plus(rateio).plus(extras)
  return {
    materiais: reais(materiais),
    producao: reais(producao),
    rateio: reais(rateio),
    extras: reais(extras),
    custoDireto: reais(custoDireto),
    minutosProducao: minutosTotal.toDecimalPlaces(1).toFixed(1),
    linhas,
  }
}

/**
 * Medidas de referência para o custo "por unidade de cálculo" do produto (o que aparece no cadastro e
 * alimenta a lista de preços): 1 m² (ou a medida padrão), 1 metro, 1 unidade, 1 milheiro ou 1 hora.
 */
export function medidasDeReferencia(p: { modoCalculo: ModoCalculo; larguraPadrao?: Valor; alturaPadrao?: Valor; loteMilheiro?: number }): { medidas: MedidasItem; divisor: number; unidade: string } {
  const lp = dec(p.larguraPadrao)
  const ap = dec(p.alturaPadrao)
  switch (p.modoCalculo) {
    case 'm2': {
      const [l, a] = lp.gt(0) && ap.gt(0) ? [lp, ap] : [new Decimal(1), new Decimal(1)]
      return { medidas: { quantidade: 1, largura: l.toString(), altura: a.toString() }, divisor: l.mul(a).toNumber(), unidade: 'm²' }
    }
    case 'metro_linear':
      return { medidas: { quantidade: 1, largura: 1, altura: ap.gt(0) ? ap.toString() : 1 }, divisor: 1, unidade: 'm' }
    case 'milheiro': {
      const lote = p.loteMilheiro ?? 1000
      return { medidas: { quantidade: lote, largura: p.larguraPadrao, altura: p.alturaPadrao }, divisor: 1, unidade: 'milheiro' }
    }
    case 'hora':
      return { medidas: { quantidade: 1, largura: p.larguraPadrao, altura: p.alturaPadrao }, divisor: 1, unidade: 'h' }
    default:
      return { medidas: { quantidade: 1, largura: p.larguraPadrao, altura: p.alturaPadrao }, divisor: 1, unidade: 'un' }
  }
}

/** Custo direto por unidade de cálculo do produto (R$/m², R$/un…), com o detalhamento da referência. */
export function custoDeReferencia(
  c: Composicao,
  p: { modoCalculo: ModoCalculo; larguraPadrao?: Valor; alturaPadrao?: Valor; loteMilheiro?: number },
  opcoes: { custoFixoHora?: Valor } = {},
): CustoItem & { porUnidade: string; unidade: string } {
  const ref = medidasDeReferencia(p)
  const item = calcularCustoItem(c, ref.medidas, opcoes)
  const porUnidade = ref.divisor > 0 ? reais(dec(item.custoDireto).div(ref.divisor)) : item.custoDireto
  return { ...item, porUnidade, unidade: ref.unidade }
}

// ─── Item vendido (orçamento, pedido, PDV) ────────────────────────────────────

/**
 * Acabamento com custo: o custo manual por unidade da cobrança (mão de obra, terceiro) + os insumos que ele
 * consome por unidade da cobrança (ilhós: 2 un por metro de perímetro; bastão: 1 m por metro linear).
 */
export interface AcabamentoCusto {
  nome: string
  tipoCobranca: TipoCobranca
  custo: Valor
  materiais?: MaterialComposicaoAcabamento[]
}

/** Insumo do acabamento: quantidade por unidade da cobrança do acabamento (com perda) */
export interface MaterialComposicaoAcabamento {
  nome: string
  custoUnitario: Valor
  unidade?: string
  quantidade: Valor
  perdaPercentual: Valor
}

/** Quantidade da cobrança do acabamento com as medidas reais (sem área mínima): 1, peças, m², m ou perímetro. */
export function baseDoAcabamento(tipo: TipoCobranca, m: MedidasItem): Decimal {
  const pecas = dec(m.quantidade)
  const largura = dec(m.largura)
  const altura = dec(m.altura)
  switch (tipo) {
    case 'fixo':
      return new Decimal(1)
    case 'por_m2':
      return largura.mul(altura).mul(pecas)
    case 'por_metro_linear':
      return largura.mul(pecas)
    case 'por_perimetro':
      return largura.plus(altura).mul(2).mul(pecas)
    default:
      return pecas
  }
}

/** Consumo de um insumo do acabamento (na unidade de uso, com perda) — custo e baixa de estoque usam o mesmo. */
export function consumoDoAcabamento(
  a: Pick<AcabamentoCusto, 'tipoCobranca'>,
  material: Pick<MaterialComposicaoAcabamento, 'quantidade' | 'perdaPercentual'>,
  m: MedidasItem,
): string {
  return baseDoAcabamento(a.tipoCobranca, m)
    .mul(dec(material.quantidade))
    .mul(dec(1).plus(dec(material.perdaPercentual).div(100)))
    .toDecimalPlaces(3, Decimal.ROUND_HALF_UP)
    .toFixed(3)
}

export function custoDoAcabamento(a: AcabamentoCusto, m: MedidasItem): { valor: string; linhas: LinhaCusto[] } {
  const base = baseDoAcabamento(a.tipoCobranca, m)
  let total = base.mul(dec(a.custo))
  const linhas: LinhaCusto[] = []
  if (total.gt(0)) linhas.push({ grupo: 'acabamento', nome: a.nome, quantidade: base.toDecimalPlaces(3).toFixed(3), unidade: '', valor: reais(total) })
  for (const mat of a.materiais ?? []) {
    const qtd = dec(consumoDoAcabamento(a, mat, m))
    const valor = qtd.mul(dec(mat.custoUnitario))
    total = total.plus(valor)
    linhas.push({ grupo: 'acabamento', nome: a.nome + ': ' + mat.nome, quantidade: qtd.toFixed(3), unidade: mat.unidade ?? '', valor: reais(valor) })
  }
  return { valor: reais(total), linhas }
}

export interface EntradaCustoVenda {
  produto: {
    modoCusto: 'simples' | 'composicao'
    modoCalculo: ModoCalculo
    /** Modo simples: custo por unidade de cálculo (R$/m², R$/un…) */
    custoUnitario: Valor
    composicao?: Composicao | null
    loteMilheiro?: number
  }
  acabamentos: AcabamentoCusto[]
  medidas: MedidasItem
  custoFixoHora?: Valor
}

export interface CustoVenda extends CustoItem {
  /** Custo do produto em si no modo simples (custo por unidade × quantidade real) */
  produto: string
  acabamentos: string
}

/**
 * Custo de um item vendido com as medidas REAIS (a área mínima é só cobrança): composição do produto (ou o
 * custo por unidade no modo simples × quantidade real) + acabamentos (custo manual + insumos).
 */
export function custoDaVenda(e: EntradaCustoVenda): CustoVenda {
  const m = e.medidas
  let base: CustoItem = { materiais: '0.00', producao: '0.00', rateio: '0.00', extras: '0.00', custoDireto: '0.00', minutosProducao: '0.0', linhas: [] }
  let produto = new Decimal(0)
  if (e.produto.modoCusto === 'composicao' && e.produto.composicao) {
    base = calcularCustoItem(e.produto.composicao, m, { custoFixoHora: e.custoFixoHora })
  } else {
    const pecas = dec(m.quantidade)
    let qtd: Decimal
    switch (e.produto.modoCalculo) {
      case 'm2':
        qtd = dec(m.largura).mul(dec(m.altura)).mul(pecas)
        break
      case 'metro_linear':
        qtd = dec(m.largura).mul(pecas)
        break
      case 'milheiro':
        qtd = pecas.div(e.produto.loteMilheiro ?? 1000)
        break
      default:
        qtd = pecas
    }
    produto = qtd.mul(dec(e.produto.custoUnitario))
    if (produto.gt(0)) base = { ...base, linhas: [{ grupo: 'produto', nome: 'Custo do produto', quantidade: qtd.toDecimalPlaces(3).toFixed(3), unidade: '', valor: reais(produto) }] }
  }
  let acabamentos = new Decimal(0)
  const linhas = [...base.linhas]
  for (const a of e.acabamentos) {
    const c = custoDoAcabamento(a, m)
    acabamentos = acabamentos.plus(c.valor)
    linhas.push(...c.linhas)
  }
  const custoDireto = dec(base.custoDireto).plus(produto).plus(acabamentos)
  return { ...base, produto: reais(produto), acabamentos: reais(acabamentos), custoDireto: reais(custoDireto), linhas }
}

// ─── Preço ──────────────────────────────────────────────────────────────────

/** Percentuais sobre o preço de venda */
export interface PercentuaisPreco {
  impostos: Valor
  comissao: Valor
  /** Custo fixo rateado em % do preço (quando a empresa rateia assim) */
  custoFixo: Valor
}

const somaPercentuais = (p: PercentuaisPreco) => dec(p.impostos).plus(dec(p.comissao)).plus(dec(p.custoFixo))

/**
 * Preço sugerido para o lucro desejado (% sobre o preço): custo direto ÷ (1 − (impostos + comissão +
 * custo fixo + lucro)/100). Null se os percentuais somarem 95% ou mais (não há preço possível).
 */
export function precoSugerido(custoDireto: Valor, percentuais: PercentuaisPreco, lucroDesejado: Valor): string | null {
  const divisor = new Decimal(1).minus(somaPercentuais(percentuais).plus(dec(lucroDesejado)).div(100))
  if (divisor.lte(0.05)) return null
  return reais(dec(custoDireto).div(divisor))
}

export type SituacaoLucro = 'ok' | 'baixo' | 'prejuizo' | 'sem_custo'

export interface AnalisePreco {
  /** Lucro em R$ depois de custo direto, impostos, comissão e custo fixo em % */
  lucro: string
  /** Lucro em % do preço */
  lucroPercentual: string
  /** Quanto vai para impostos + comissão + custo fixo % */
  despesasSobrePreco: string
  situacao: SituacaoLucro
}

/** Quanto sobra de um preço: verde (≥ mínimo), amarelo (abaixo do mínimo), vermelho (prejuízo). */
export function analisarPreco(preco: Valor, custoDireto: Valor, percentuais: PercentuaisPreco, lucroMinimo: Valor): AnalisePreco {
  const p = dec(preco)
  const despesas = p.mul(somaPercentuais(percentuais)).div(100)
  const lucro = p.minus(despesas).minus(dec(custoDireto))
  const pct = p.gt(0) ? lucro.div(p).mul(100) : new Decimal(0)
  const situacao: SituacaoLucro = dec(custoDireto).lte(0) ? 'sem_custo' : lucro.lt(0) ? 'prejuizo' : pct.lt(dec(lucroMinimo)) ? 'baixo' : 'ok'
  return { lucro: reais(lucro), lucroPercentual: pct.toDecimalPlaces(1).toFixed(1), despesasSobrePreco: reais(despesas), situacao }
}

/** Markup antigo (% sobre o custo) → lucro sobre o preço, sem impostos: m ÷ (100 + m). Usado na migração. */
export function markupParaLucro(markup: Valor): string {
  const m = dec(markup)
  if (m.lte(-100)) return '0.00'
  return m.div(new Decimal(100).plus(m)).mul(100).toDecimalPlaces(2).toFixed(2)
}

// ─── Configuração da empresa ───────────────────────────────────────────────

export const MODOS_RATEIO = ['nenhum', 'percentual', 'por_hora'] as const
export type ModoRateio = (typeof MODOS_RATEIO)[number]

export interface ConfigPrecificacao {
  impostosPercentual: Valor
  comissaoPercentual: Valor
  rateioModo: ModoRateio
  custoFixoPercentual: Valor
  custoFixoMensal: Valor
  horasProdutivasMes: Valor
  lucroDesejadoPadrao: Valor
  lucroMinimoPadrao: Valor
}

/** Percentuais sobre o preço e custo fixo por hora, a partir da configuração da empresa. */
export function parametrosDaEmpresa(cfg: ConfigPrecificacao): { percentuais: PercentuaisPreco; custoFixoHora: string } {
  const porHora = cfg.rateioModo === 'por_hora' && dec(cfg.horasProdutivasMes).gt(0) ? dec(cfg.custoFixoMensal).div(dec(cfg.horasProdutivasMes)) : new Decimal(0)
  return {
    percentuais: { impostos: cfg.impostosPercentual, comissao: cfg.comissaoPercentual, custoFixo: cfg.rateioModo === 'percentual' ? cfg.custoFixoPercentual : 0 },
    custoFixoHora: porHora.toDecimalPlaces(4).toFixed(4),
  }
}
