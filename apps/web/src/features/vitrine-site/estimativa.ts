import { formatarMoeda, type ModoCalculo, type PrecoVitrine } from '@onprint/shared'

/**
 * Estimativa do valor enquanto o visitante escolhe (funções puras, testadas). Usa só o preço que o site já mostra
 * (preço de venda por unidade da cobrança): sem custo, margem, área mínima nem acabamentos (estes não têm preço
 * público). O valor final é sempre o do orçamento da gráfica.
 */

export interface EntradaEstimativa {
  preco: PrecoVitrine
  modoCalculo: ModoCalculo
  /** Peças (no milheiro, em unidades: 1.000 = 1 milheiro) */
  quantidade: number
  /** Metros (só m² e metro linear) */
  largura?: number | string | null
  altura?: number | string | null
}

const numero = (v: number | string | null | undefined) => {
  if (v === null || v === undefined || v === '') return NaN
  return Number(v)
}

/** Total estimado em reais; null quando não dá para estimar (sob consulta, por hora, medidas faltando) */
export function calcularEstimativa(e: EntradaEstimativa): number | null {
  if (e.preco.modo === 'sob_consulta') return null
  const valor = numero(e.preco.valor)
  const qtd = Math.trunc(e.quantidade)
  if (!Number.isFinite(valor) || valor <= 0 || !Number.isFinite(qtd) || qtd < 1) return null
  const largura = numero(e.largura)
  const altura = numero(e.altura)
  let unidades: number
  switch (e.modoCalculo) {
    case 'm2':
      if (!(largura > 0) || !(altura > 0)) return null
      unidades = largura * altura * qtd
      break
    case 'metro_linear':
      if (!(largura > 0)) return null
      unidades = largura * qtd
      break
    case 'milheiro':
      unidades = qtd / 1000
      break
    case 'unidade':
      unidades = qtd
      break
    default:
      // Por hora: a quantidade de horas é a gráfica que define
      return null
  }
  return Math.round(valor * unidades * 100) / 100
}

/** "Estimativa: R$ 156,00" / "Estimativa: a partir de R$ 156,00", com "+ acabamentos" quando há algum marcado */
export function textoEstimativa(total: number, p: { aPartirDe: boolean; comAcabamentos: boolean }): string {
  return `Estimativa: ${p.aPartirDe ? 'a partir de ' : ''}${formatarMoeda(total)}${p.comAcabamentos ? ' + acabamentos' : ''}`
}

/** Soma das estimativas da lista; null se algum item não tem estimativa (melhor não mostrar um total pela metade) */
export function somarEstimativas(valores: (number | null)[]): number | null {
  if (!valores.length || valores.some((v) => v === null)) return null
  return Math.round((valores as number[]).reduce((a, b) => a + b, 0) * 100) / 100
}
