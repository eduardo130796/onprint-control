import { formatarDataSimples, formatarMoeda, type FormatoValor } from '@onprint/shared'

/** Formata um valor de relatório/KPI conforme o formato declarado pela API. */
export function formatarValor(valor: string | number | null | undefined, formato: FormatoValor): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (formato === 'texto') return String(valor)
  if (formato === 'data') return formatarDataSimples(String(valor))
  const n = Number(valor)
  if (formato === 'moeda') return formatarMoeda(n)
  if (formato === 'percentual') return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
  if (formato === 'horas') return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

/** Versão para CSV: números crus com vírgula decimal (Excel brasileiro). */
export function valorCsv(valor: string | number | null | undefined, formato: FormatoValor): string {
  if (valor === null || valor === undefined || valor === '') return ''
  if (formato === 'texto') return String(valor)
  if (formato === 'data') return formatarDataSimples(String(valor))
  const n = Number(valor)
  return Number.isFinite(n) ? String(n).replace('.', ',') : String(valor)
}
