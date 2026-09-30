import Decimal from 'decimal.js'
import { adicionarDias } from './datas'

export interface ParcelaGerada {
  parcela: number
  totalParcelas: number
  tipo: 'sinal' | 'parcela'
  valor: string
  vencimento: string
}

export interface OpcoesParcelamento {
  total: Decimal.Value
  sinalPercentual: Decimal.Value
  /** Parcelas do saldo (depois do sinal) */
  parcelas: number
  intervaloDias: number
  hoje: string
  /** Vencimento da 1ª parcela do saldo; padrão: hoje + intervalo */
  primeiroVencimento?: string | null
}

/**
 * Sinal (à vista, hoje) + saldo em N parcelas iguais. Os centavos que sobram
 * da divisão vão para a última parcela, então a soma sempre fecha com o total.
 */
export function gerarParcelas(o: OpcoesParcelamento): ParcelaGerada[] {
  const total = new Decimal(o.total)
  const sinal = total.mul(new Decimal(o.sinalPercentual).div(100)).toDecimalPlaces(2)
  const saldo = total.minus(sinal)
  const nParcelas = saldo.gt(0) ? Math.max(1, o.parcelas) : 0
  const totalParcelas = (sinal.gt(0) ? 1 : 0) + nParcelas
  const resultado: ParcelaGerada[] = []

  if (sinal.gt(0)) {
    resultado.push({ parcela: 1, totalParcelas, tipo: 'sinal', valor: sinal.toFixed(2), vencimento: o.hoje })
  }
  if (nParcelas > 0) {
    const base = saldo.div(nParcelas).toDecimalPlaces(2, Decimal.ROUND_DOWN)
    const primeiro = o.primeiroVencimento ?? adicionarDias(o.hoje, o.intervaloDias)
    for (let i = 0; i < nParcelas; i++) {
      const valor = i === nParcelas - 1 ? saldo.minus(base.mul(nParcelas - 1)) : base
      resultado.push({
        parcela: resultado.length + 1,
        totalParcelas,
        tipo: 'parcela',
        valor: valor.toFixed(2),
        vencimento: adicionarDias(primeiro, i * o.intervaloDias),
      })
    }
  }
  return resultado
}
