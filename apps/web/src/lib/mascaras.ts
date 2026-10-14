import { somenteDigitos } from '@onprint/shared'

/** Máscara progressiva (aplicada enquanto o usuário digita). */
function aplicar(digitos: string, padrao: string): string {
  let resultado = ''
  let i = 0
  for (const c of padrao) {
    if (i >= digitos.length) break
    if (c === '#') resultado += digitos[i++]
    else resultado += c
  }
  return resultado
}

export function mascaraCpfCnpj(valor: string | null | undefined): string {
  const d = somenteDigitos(valor ?? '').slice(0, 14)
  return d.length <= 11 ? aplicar(d, '###.###.###-##') : aplicar(d, '##.###.###/####-##')
}

export function mascaraTelefone(valor: string | null | undefined): string {
  const d = somenteDigitos(valor ?? '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  return d.length <= 10 ? aplicar(d, '(##) ####-####') : aplicar(d, '(##) #####-####')
}

export function mascaraCep(valor: string | null | undefined): string {
  return aplicar(somenteDigitos(valor ?? '').slice(0, 8), '#####-###')
}

/**
 * Valor monetário digitado da direita para a esquerda (centavos): "123456" → "1.234,56".
 */
export function mascaraMoeda(valor: string | number | null | undefined): string {
  const centavos = somenteDigitos(typeof valor === 'number' ? valor.toFixed(2) : (valor ?? '')).replace(/^0+/, '')
  const inteiro = (centavos.slice(0, -2) || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${inteiro},${centavos.slice(-2).padStart(2, '0')}`
}

/** Converte valor da API ("1234.5") para o formato do input ("1.234,50"). */
export function decimalParaInput(valor: string | number | null | undefined, casas = 2): string {
  const n = Number(valor ?? 0)
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

/**
 * Decimal da API para um NumberInput, sem zeros sobrando e SEM separador de milhar:
 * "1000.000" → "1000", "2.500" → "2,5", "1234.5" → "1234,5".
 * Não use decimalParaInput(...).replace(/,?0+$/, ''): "1000" vira "1.000", que sem vírgula
 * é lido como 1 (ponto = decimal da API) e o total do orçamento cai 1000 vezes.
 */
export function decimalParaCampo(valor: string | number | null | undefined, casasMax = 3): string {
  if (valor === null || valor === undefined || valor === '') return ''
  const n = Number(valor)
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('pt-BR', { maximumFractionDigits: casasMax, useGrouping: false })
}
