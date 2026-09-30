import { somenteDigitos } from './format'

function digitoVerificador(base: string, pesos: number[]): number {
  const soma = pesos.reduce((acc, peso, i) => acc + Number(base[i]) * peso, 0)
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

export function cpfValido(valor: string): boolean {
  const d = somenteDigitos(valor)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const d1 = digitoVerificador(d, [10, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = digitoVerificador(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
  return d1 === Number(d[9]) && d2 === Number(d[10])
}

export function cnpjValido(valor: string): boolean {
  const d = somenteDigitos(valor)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const d1 = digitoVerificador(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = digitoVerificador(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return d1 === Number(d[12]) && d2 === Number(d[13])
}

export function cpfCnpjValido(valor: string): boolean {
  return somenteDigitos(valor).length === 11 ? cpfValido(valor) : cnpjValido(valor)
}
