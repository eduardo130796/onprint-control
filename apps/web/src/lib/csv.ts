export interface ColunaCsv<T> {
  titulo: string
  valor: (linha: T) => string | number | null | undefined
}

/** Número já formatado como texto (ex.: "-10,00", "+5", "-1.234,5"): não é fórmula. */
const NUMERO_TEXTO = /^[-+]?\d[\d.]*(,\d+)?$/

/**
 * Injeção de fórmula: no Excel, texto que começa com = + - @ (ou TAB/CR) vira fórmula.
 * Um apóstrofo na frente faz a planilha tratar a célula como texto. Números ficam como estão.
 */
export function neutralizarFormula(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return ''
  const texto = String(valor)
  if (typeof valor === 'number' || NUMERO_TEXTO.test(texto)) return texto
  return /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto
}

function celula(valor: string | number | null | undefined): string {
  const texto = neutralizarFormula(valor)
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

/** CSV no padrão do Excel brasileiro: separador ";" e BOM UTF-8 para acentos. */
export function gerarCsv<T>(colunas: ColunaCsv<T>[], linhas: T[]): string {
  const cabecalho = colunas.map((c) => celula(c.titulo)).join(';')
  const corpo = linhas.map((l) => colunas.map((c) => celula(c.valor(l))).join(';'))
  return '﻿' + [cabecalho, ...corpo].join('\r\n')
}

export function baixarArquivo(conteudo: BlobPart, nome: string, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }))
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
