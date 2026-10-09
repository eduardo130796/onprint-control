import { Decimal, gerarParcelas, hojeISO, normalizarDecimal } from '@onprint/shared'

/**
 * Pagamento da compra (entrada de estoque a prazo): parcelas que viram contas a pagar.
 * A API exige que a soma das parcelas seja o total da entrada, calculado como ela calcula:
 * cada item arredondado em centavos (quantidade × custo) e depois somado.
 */

export interface ParcelaCompra {
  /** AAAA-MM-DD */
  vencimento: string
  /** Texto do campo ("1.234,56") */
  valor: string
}

/** Decimal da API ("1234.56") → texto do campo de moeda ("1.234,56"). */
export const moedaParaCampo = (v: string) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const dec = (v: string | null | undefined) => {
  const t = v?.trim() ? normalizarDecimal(v) : '0'
  return /^-?\d+(\.\d+)?$/.test(t) ? new Decimal(t) : new Decimal(0)
}

/** Total da entrada igual ao da API: soma dos itens, cada um arredondado em centavos. */
export function totalDaEntrada(itens: { quantidade: string; custoUnitario: string }[]): string {
  return itens.reduce((s, i) => s.plus(dec(i.quantidade).mul(dec(i.custoUnitario)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)), new Decimal(0)).toFixed(2)
}

/**
 * Divide o total em N parcelas a cada 30 dias, a primeira 30 dias depois da data da compra. Os centavos
 * que sobram vão para a última parcela (mesma regra da conversão do orçamento), então a soma fecha.
 */
export function dividirEmParcelas(total: string, quantidade: number, dataCompra: string, intervaloDias = 30): ParcelaCompra[] {
  const n = Math.min(12, Math.max(1, Math.trunc(quantidade) || 1))
  // Data apagada no campo: conta a partir de hoje (não quebra a tela)
  const base = /^\d{4}-\d{2}-\d{2}$/.test(dataCompra) ? dataCompra : hojeISO()
  return gerarParcelas({ total: dec(total).lt(0) ? 0 : dec(total), sinalPercentual: 0, parcelas: n, intervaloDias, hoje: base }).map((p) => ({ vencimento: p.vencimento, valor: moedaParaCampo(p.valor) }))
}

/** Quanto falta (positivo) ou sobra (negativo) nas parcelas para fechar o total: "0.00" quando bate. */
export function diferencaDasParcelas(total: string, parcelas: ParcelaCompra[]): string {
  return parcelas.reduce((s, p) => s.minus(dec(p.valor)), dec(total)).toFixed(2)
}

/** Parcelas no formato da API (`contaPagar.parcelas`). */
export function parcelasParaApi(parcelas: ParcelaCompra[]): { vencimento: string; valor: string }[] {
  return parcelas.map((p) => ({ vencimento: p.vencimento, valor: dec(p.valor).toFixed(2) }))
}

export interface EstadoPagamento {
  aPrazo: boolean
  vezes: number
  /** Parcelas editadas pela pessoa; null = divididas automaticamente (acompanham o total e a data) */
  editadas: ParcelaCompra[] | null
  formaPagamentoId: string
  categoriaId: string
}

export const pagamentoInicial: EstadoPagamento = { aPrazo: false, vezes: 1, editadas: null, formaPagamentoId: '', categoriaId: '' }

/** Parcelas valendo agora: as editadas ou a divisão automática do total. */
export const parcelasAtuais = (p: EstadoPagamento, total: string, dataCompra: string) => p.editadas ?? dividirEmParcelas(total, p.vezes, dataCompra)
