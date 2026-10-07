const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']
const ESCALAS: [string, string][] = [
  ['', ''],
  ['mil', 'mil'],
  ['milhão', 'milhões'],
  ['bilhão', 'bilhões'],
]

/** 1 a 999 por extenso ("cento e vinte e três"). */
function ate999(n: number): string {
  if (n === 100) return 'cem'
  const partes: string[] = []
  const c = Math.floor(n / 100)
  const resto = n % 100
  if (c) partes.push(CENTENAS[c]!)
  if (resto < 20) {
    if (resto) partes.push(UNIDADES[resto]!)
  } else {
    partes.push(DEZENAS[Math.floor(resto / 10)]!)
    if (resto % 10) partes.push(UNIDADES[resto % 10]!)
  }
  return partes.join(' e ')
}

/** Inteiro não negativo por extenso ("mil duzentos e trinta e quatro"). */
function inteiro(n: number): string {
  if (n === 0) return 'zero'
  const grupos: number[] = []
  for (let x = n; x > 0; x = Math.floor(x / 1000)) grupos.push(x % 1000)
  const textos: { texto: string; valor: number }[] = []
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i]!
    if (!g) continue
    const [singular, plural] = ESCALAS[i]!
    const texto = i === 1 && g === 1 ? 'mil' : i === 0 ? ate999(g) : `${ate999(g)} ${g === 1 ? singular : plural}`
    textos.push({ texto, valor: g })
  }
  // "e" antes do último grupo quando ele é menor que 100 ou centena redonda (mil e cem, mil e cinquenta)
  return textos
    .map((t, i) => (i > 0 && i === textos.length - 1 && (t.valor < 100 || t.valor % 100 === 0) ? `e ${t.texto}` : t.texto))
    .join(' ')
}

/**
 * Valor em reais por extenso, para recibos: "trezentos e cinquenta reais",
 * "um milhão de reais", "dez reais e cinco centavos", "cinquenta centavos".
 */
export function valorPorExtenso(valor: number | string): string {
  const centavosTotal = Math.round(Number(valor) * 100)
  if (!Number.isFinite(centavosTotal) || centavosTotal < 0) return ''
  const reais = Math.floor(centavosTotal / 100)
  const centavos = centavosTotal % 100
  const partes: string[] = []
  if (reais > 0) {
    const redondoMilhao = reais >= 1_000_000 && reais % 1_000_000 === 0
    partes.push(`${inteiro(reais)}${redondoMilhao ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`)
  }
  if (centavos > 0) partes.push(`${inteiro(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`)
  return partes.length ? partes.join(' e ') : 'zero real'
}
