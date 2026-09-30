export const FUSO_HORARIO = 'America/Sao_Paulo'

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_HORARIO })
const dataHoraBR = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_HORARIO,
  dateStyle: 'short',
  timeStyle: 'short',
})

function paraData(data: string | Date) {
  return typeof data === 'string' ? new Date(data) : data
}

/** R$ 1.234,56 — aceita número ou string decimal ("1234.50", formato de tráfego da API). */
export function formatarMoeda(valor: number | string | null | undefined): string {
  // Intl usa espaço não separável após "R$"; normalizamos para espaço comum
  return moeda.format(Number(valor ?? 0)).replace(/\s/g, ' ')
}

/** dd/mm/aaaa no fuso America/Sao_Paulo */
export function formatarData(data: string | Date | null | undefined): string {
  return data ? dataBR.format(paraData(data)) : '—'
}

/** dd/mm/aaaa hh:mm no fuso America/Sao_Paulo */
export function formatarDataHora(data: string | Date | null | undefined): string {
  return data ? dataHoraBR.format(paraData(data)) : '—'
}

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

/** 000.000.000-00 ou 00.000.000/0000-00 */
export function formatarCpfCnpj(valor: string | null | undefined): string {
  const d = somenteDigitos(valor ?? '')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return valor ?? ''
}

/** (00) 0000-0000 ou (00) 00000-0000 */
export function formatarTelefone(valor: string | null | undefined): string {
  const d = somenteDigitos(valor ?? '')
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  return valor ?? ''
}

/** 00000-000 */
export function formatarCep(valor: string | null | undefined): string {
  const d = somenteDigitos(valor ?? '')
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : (valor ?? '')
}

export function iniciais(nome: string): string {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

/**
 * Data sem hora (colunas DATE: validade, vencimento, previsão) em dd/mm/aaaa.
 * Não converte fuso: "2026-10-06T00:00:00.000Z" continua sendo 06/10/2026.
 */
export function formatarDataSimples(data: string | null | undefined): string {
  if (!data) return '-'
  const [a, m, d] = data.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
