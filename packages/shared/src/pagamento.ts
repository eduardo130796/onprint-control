import Decimal from 'decimal.js'
import { formatarMoeda } from './format'
import { gerarParcelas, type ParcelaGerada } from './parcelas'

/**
 * Pagamento combinado no orçamento: entrada (% do total, na aprovação) + o saldo em N parcelas a cada X dias.
 * Parcelas = 0: o saldo é pago na retirada/entrega (uma conta só, que vence na previsão de entrega do pedido).
 * É a mesma regra que gera as contas a receber na conversão (gerarParcelas), então o que a mensagem, o PDF e a
 * página de aprovação prometem é exatamente o que o pedido cobra.
 */
export interface PlanoPagamento {
  sinalPercentual: Decimal.Value
  parcelas: number
  intervaloDias: number
}

/** Data qualquer: o resumo não mostra datas, só valores e intervalos */
const BASE = '2000-01-01'

const percentualTexto = (v: Decimal.Value) => new Decimal(v).toNumber().toLocaleString('pt-BR', { maximumFractionDigits: 2 })

/** "2× de R$ 33,33 e 1× de R$ 33,34" (parcelas iguais agrupadas; os centavos da divisão ficam na última) */
function parcelasTexto(saldo: ParcelaGerada[]): string {
  const grupos: { qtd: number; valor: string }[] = []
  for (const p of saldo) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.valor === p.valor) ultimo.qtd++
    else grupos.push({ qtd: 1, valor: p.valor })
  }
  return grupos.map((g) => `${g.qtd}× de ${formatarMoeda(g.valor)}`).join(' e ')
}

/**
 * Resumo do pagamento em uma linha, para o cliente (editor, PDF, página de aprovação e {{condicoes_pagamento}}):
 * - "À vista na aprovação" (entrada de 100%)
 * - "Entrada de R$ 450,00 (50%) na aprovação + 1× de R$ 450,00 em 30 dias"
 * - "Entrada de R$ 300,00 (50%) na aprovação + 2× de R$ 150,00 a cada 30 dias"
 * - "Sem entrada: 3× de R$ 300,00 a cada 30 dias"
 * - "Entrada de R$ 450,00 (50%) na aprovação + R$ 450,00 na retirada/entrega" (parcelas = 0)
 */
export function resumoCondicoesPagamento(p: PlanoPagamento & { total: Decimal.Value }): string {
  const total = new Decimal(p.total || 0)
  if (total.lte(0)) return 'Sem valor a pagar'
  const contas = gerarParcelas({ total, sinalPercentual: p.sinalPercentual, parcelas: p.parcelas, intervaloDias: p.intervaloDias, hoje: BASE })
  const sinal = contas.find((c) => c.tipo === 'sinal')
  const saldo = contas.filter((c) => c.tipo === 'parcela')
  if (saldo.length === 0) return 'À vista na aprovação'

  const resto =
    p.parcelas <= 0
      ? `${formatarMoeda(saldo[0]!.valor)} na retirada/entrega`
      : `${parcelasTexto(saldo)} ${saldo.length === 1 ? `em ${p.intervaloDias} dias` : `a cada ${p.intervaloDias} dias`}`
  return sinal ? `Entrada de ${formatarMoeda(sinal.valor)} (${percentualTexto(p.sinalPercentual)}%) na aprovação + ${resto}` : `Sem entrada: ${resto}`
}
