export interface ColunaCsv<T> {
  titulo: string
  valor: (linha: T) => string | number | null | undefined
}

function celula(valor: string | number | null | undefined): string {
  const texto = valor === null || valor === undefined ? '' : String(valor)
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
