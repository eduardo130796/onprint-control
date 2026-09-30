import Decimal from 'decimal.js'
import type { ModoCalculo, TipoCobranca } from './enums'

/**
 * Motor de precificação (seção 9 do ARQUITETURA.md).
 * Função pura, usada pelo front (valores ao vivo) e pela API (que recalcula tudo ao salvar).
 * Todas as contas usam decimal.js; cada componente é arredondado em centavos e o total é a soma deles.
 */
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP })

export type Valor = Decimal.Value

export interface AcabamentoPreco {
  id?: string
  nome: string
  tipoCobranca: TipoCobranca
  valor: Valor
  custo?: Valor
}

export interface EntradaPreco {
  modoCalculo: ModoCalculo
  /** Preço por unidade de cálculo: por peça, m², metro, milheiro ou hora */
  precoUnitario: Valor
  custoUnitario?: Valor
  /** Peças (unidade, m², metro linear), unidades (milheiro) ou horas (hora) */
  quantidade: Valor
  /** Metros. No modo metro linear é o comprimento */
  largura?: Valor | null
  altura?: Valor | null
  /** Área mínima cobrada por peça no modo m² (configuração da empresa) */
  areaMinimaM2?: Valor | null
  /** Tamanho do lote no modo milheiro (padrão 1000) */
  loteMilheiro?: number
  medidasMaximas?: { largura?: Valor | null; altura?: Valor | null }
  precoMinimo?: Valor | null
  acabamentos?: AcabamentoPreco[]
}

export interface AcabamentoCalculado {
  id?: string
  nome: string
  tipoCobranca: TipoCobranca
  /** Quantidade sobre a qual o valor foi aplicado (1, peças, m², metros) */
  base: string
  valor: string
}

export interface ResultadoPreco {
  ok: boolean
  erros: string[]
  /** m² de uma peça (largura × altura) */
  areaUnitaria: string
  /** m² cobrados por peça (respeitando a área mínima) */
  areaCobradaUnitaria: string
  /** 2 × (largura + altura) de uma peça */
  perimetroUnitario: string
  /** Quantidade na unidade de cálculo: m² totais, metros, milheiros, horas ou peças */
  quantidadeCobrada: string
  valorProduto: string
  acabamentos: AcabamentoCalculado[]
  valorAcabamentos: string
  total: string
  /** Total dividido pela quantidade de peças */
  valorPorPeca: string
  abaixoDoMinimo: boolean
  custoTotal: string
  /** Margem sobre o preço de venda: (total − custo) ÷ total × 100 */
  margemPercentual: string | null
}

const ZERO = new Decimal(0)

function dec(v: Valor | null | undefined): Decimal {
  if (v === null || v === undefined || v === '') return ZERO
  try {
    return new Decimal(v)
  } catch {
    return new Decimal(NaN)
  }
}

const moeda = (v: Decimal) => v.toDecimalPlaces(2)
const medida = (v: Decimal) => v.toDecimalPlaces(3).toFixed(3)

/** Arredonda para 2 casas e devolve string decimal, formato de tráfego da API. */
export function paraMoeda(valor: Valor): string {
  return new Decimal(valor).toDecimalPlaces(2).toFixed(2)
}

/** A peça cabe nas medidas máximas em qualquer orientação (pode ser girada)? */
export function cabeNasMedidas(largura: Decimal, altura: Decimal, max: EntradaPreco['medidasMaximas']): boolean {
  const ml = max?.largura ? dec(max.largura) : null
  const ma = max?.altura ? dec(max.altura) : null
  if (!ml && !ma) return true
  const cabe = (l: Decimal, a: Decimal) => (!ml || l.lte(ml)) && (!ma || a.lte(ma))
  return cabe(largura, altura) || cabe(altura, largura)
}

const MODOS_COM_MEDIDAS: ModoCalculo[] = ['m2']

export function calcularPreco(e: EntradaPreco): ResultadoPreco {
  const erros: string[] = []
  const quantidade = dec(e.quantidade)
  const largura = dec(e.largura)
  const altura = dec(e.altura)
  const preco = dec(e.precoUnitario)

  if (quantidade.isNaN() || quantidade.lte(0)) erros.push('Informe uma quantidade maior que zero.')
  if (preco.isNaN() || preco.lt(0)) erros.push('Preço unitário inválido.')
  if (largura.isNaN() || altura.isNaN() || largura.lt(0) || altura.lt(0)) erros.push('Medidas inválidas.')
  if (MODOS_COM_MEDIDAS.includes(e.modoCalculo) && (largura.lte(0) || altura.lte(0))) {
    erros.push('Informe largura e altura (em metros).')
  }
  if (e.modoCalculo === 'metro_linear' && largura.lte(0)) erros.push('Informe o comprimento (em metros).')
  if (e.modoCalculo === 'milheiro' && !quantidade.isInteger()) erros.push('No milheiro a quantidade deve ser inteira.')
  if (largura.gt(0) && altura.gt(0) && !cabeNasMedidas(largura, altura, e.medidasMaximas)) {
    const ml = e.medidasMaximas?.largura ? dec(e.medidasMaximas.largura).toString() : '—'
    const ma = e.medidasMaximas?.altura ? dec(e.medidasMaximas.altura).toString() : '—'
    erros.push(`Medidas acima do máximo do produto (${ml} × ${ma} m).`)
  }

  const valido = erros.length === 0
  const q = valido ? quantidade : ZERO
  const areaUnitaria = largura.mul(altura)
  const areaCobradaUnitaria = Decimal.max(areaUnitaria, dec(e.areaMinimaM2))
  const perimetroUnitario = largura.plus(altura).mul(2)

  // Quantidade na unidade de cálculo do produto
  let quantidadeCobrada: Decimal
  switch (e.modoCalculo) {
    case 'm2':
      quantidadeCobrada = areaCobradaUnitaria.mul(q)
      break
    case 'metro_linear':
      quantidadeCobrada = largura.mul(q)
      break
    case 'milheiro':
      quantidadeCobrada = q.div(e.loteMilheiro ?? 1000).ceil()
      break
    default: // unidade e hora
      quantidadeCobrada = q
  }
  const valorProduto = valido ? moeda(quantidadeCobrada.mul(preco)) : ZERO

  let custoTotal = dec(e.custoUnitario).mul(quantidadeCobrada)
  const acabamentos: AcabamentoCalculado[] = []
  for (const a of e.acabamentos ?? []) {
    let base: Decimal
    switch (a.tipoCobranca) {
      case 'fixo':
        base = new Decimal(1)
        break
      case 'por_unidade':
        base = q
        break
      case 'por_m2':
        base = (e.modoCalculo === 'm2' ? areaCobradaUnitaria : areaUnitaria).mul(q)
        break
      case 'por_metro_linear':
        base = largura.mul(q)
        break
      case 'por_perimetro':
        base = perimetroUnitario.mul(q)
        break
    }
    const precisaMedidas = ['por_m2', 'por_metro_linear', 'por_perimetro'].includes(a.tipoCobranca)
    if (valido && precisaMedidas && (largura.lte(0) || (a.tipoCobranca !== 'por_metro_linear' && altura.lte(0)))) {
      erros.push(`O acabamento "${a.nome}" exige as medidas da peça.`)
    }
    const valor = valido ? moeda(base.mul(dec(a.valor))) : ZERO
    custoTotal = custoTotal.plus(base.mul(dec(a.custo)))
    acabamentos.push({ id: a.id, nome: a.nome, tipoCobranca: a.tipoCobranca, base: medida(base), valor: valor.toFixed(2) })
  }

  const valorAcabamentos = acabamentos.reduce((s, a) => s.plus(a.valor), ZERO)
  const ok = erros.length === 0
  const total = ok ? valorProduto.plus(valorAcabamentos) : ZERO
  custoTotal = moeda(custoTotal)

  return {
    ok,
    erros,
    areaUnitaria: medida(areaUnitaria),
    areaCobradaUnitaria: medida(e.modoCalculo === 'm2' ? areaCobradaUnitaria : areaUnitaria),
    perimetroUnitario: medida(perimetroUnitario),
    quantidadeCobrada: medida(quantidadeCobrada),
    valorProduto: valorProduto.toFixed(2),
    acabamentos,
    valorAcabamentos: (ok ? valorAcabamentos : ZERO).toFixed(2),
    total: total.toFixed(2),
    valorPorPeca: ok && q.gt(0) ? moeda(total.div(q)).toFixed(2) : '0.00',
    abaixoDoMinimo: Boolean(e.precoMinimo) && preco.lt(dec(e.precoMinimo)),
    custoTotal: custoTotal.toFixed(2),
    margemPercentual: ok && total.gt(0) ? total.minus(custoTotal).div(total).mul(100).toDecimalPlaces(2).toFixed(2) : null,
  }
}

/** Preço sugerido pela margem (markup) sobre o custo: custo × (1 + margem/100). */
export function precoPelaMargem(custo: Valor, margemPercentual: Valor): string {
  return paraMoeda(dec(custo).mul(dec(margemPercentual).div(100).plus(1)))
}

export { Decimal }
