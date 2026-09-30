import Decimal from 'decimal.js'

/** Tipos de movimentação de estoque (seção 8.6). Quantidade com sinal: positiva entra, negativa sai. */
export const TIPOS_MOVIMENTACAO = ['entrada', 'saida', 'ajuste', 'consumo_producao', 'perda', 'transferencia', 'venda_pdv'] as const
export type TipoMovimentacao = (typeof TIPOS_MOVIMENTACAO)[number]

export const TIPO_MOVIMENTACAO_ROTULOS: Record<TipoMovimentacao, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  ajuste: 'Ajuste de inventário',
  consumo_producao: 'Consumo da produção',
  perda: 'Perda',
  transferencia: 'Transferência',
  venda_pdv: 'Venda PDV',
}

/** Movimentações lançadas à mão (as demais nascem de entradas, produção e PDV). */
export const TIPOS_MOVIMENTACAO_MANUAL = ['saida', 'perda', 'ajuste', 'transferencia'] as const
export type TipoMovimentacaoManual = (typeof TIPOS_MOVIMENTACAO_MANUAL)[number]

export const SITUACOES_ESTOQUE = ['ok', 'baixo', 'zerado'] as const
export type SituacaoEstoque = (typeof SITUACOES_ESTOQUE)[number]

export const SITUACAO_ESTOQUE_ROTULOS: Record<SituacaoEstoque, string> = { ok: 'Normal', baixo: 'Abaixo do mínimo', zerado: 'Sem estoque' }

type Valor = Decimal.Value
const dec = (v: Valor | null | undefined) => new Decimal(v ?? 0)

export interface LinhaFichaTecnica {
  base: 'por_unidade' | 'por_m2' | 'por_metro_linear'
  /** Quantidade do insumo por peça, por m² ou por metro linear */
  quantidade: Valor
  perdaPercentual: Valor
}

export interface ItemProduzido {
  quantidade: Valor
  /** Metros (no metro linear, o comprimento) */
  largura?: Valor | null
  altura?: Valor | null
  /** Área total informada, usada só quando não há medidas */
  areaM2?: Valor | null
}

/**
 * Consumo de um insumo da ficha técnica para produzir o item, já com a perda.
 * Usa a área **real** (largura × altura × peças), sem a área mínima de cobrança.
 * Resultado com 3 casas decimais (precisão do saldo).
 */
export function consumoDeInsumo(ficha: LinhaFichaTecnica, item: ItemProduzido): string {
  const pecas = dec(item.quantidade)
  const largura = dec(item.largura)
  const altura = dec(item.altura)
  let base: Decimal
  switch (ficha.base) {
    case 'por_m2':
      base = largura.gt(0) && altura.gt(0) ? largura.mul(altura).mul(pecas) : dec(item.areaM2)
      break
    case 'por_metro_linear':
      base = largura.mul(pecas)
      break
    default:
      base = pecas
  }
  const fator = dec(1).plus(dec(ficha.perdaPercentual).div(100))
  return base.mul(dec(ficha.quantidade)).mul(fator).toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toFixed(3)
}

/** Custo médio ponderado após uma entrada. Com saldo zerado ou negativo, vale o custo da entrada. */
export function custoMedioAposEntrada(saldo: Valor, custoMedio: Valor, quantidade: Valor, custoUnitario: Valor): string {
  const s = dec(saldo)
  const q = dec(quantidade)
  if (s.lte(0) || s.plus(q).lte(0)) return dec(custoUnitario).toDecimalPlaces(4).toFixed(4)
  return s.mul(dec(custoMedio)).plus(q.mul(dec(custoUnitario))).div(s.plus(q)).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4)
}

/** Situação do item: sem estoque (≤ 0), abaixo do mínimo (≤ mínimo) ou normal. */
export function situacaoEstoque(saldo: Valor, minimo: Valor): SituacaoEstoque {
  const s = dec(saldo)
  if (s.lte(0)) return 'zerado'
  return s.lte(dec(minimo)) ? 'baixo' : 'ok'
}
