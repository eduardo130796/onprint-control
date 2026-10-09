import { useState } from 'react'
import { adicionarDias, hojeISO } from '@onprint/shared'

export const PERIODOS = { mes: 'Este mês', anterior: 'Mês passado', '90': 'Últimos 90 dias', ano: 'Este ano', livre: 'Escolher datas' } as const
export type Periodo = keyof typeof PERIODOS

export function intervalo(p: Periodo, hoje: string) {
  const [a, m] = hoje.split('-').map(Number) as [number, number]
  const ultimoDia = (ano: number, mes: number) => String(new Date(Date.UTC(ano, mes, 0)).getUTCDate()).padStart(2, '0')
  if (p === 'anterior') {
    const [pa, pm] = m === 1 ? [a - 1, 12] : [a, m - 1]
    const mes = `${pa}-${String(pm).padStart(2, '0')}`
    return { de: `${mes}-01`, ate: `${mes}-${ultimoDia(pa, pm)}` }
  }
  if (p === '90') return { de: adicionarDias(hoje, -89), ate: hoje }
  if (p === 'ano') return { de: `${a}-01-01`, ate: hoje }
  return { de: `${hoje.slice(0, 8)}01`, ate: hoje }
}

/** Período dos relatórios: atalhos (este mês, mês passado…) ou datas livres. */
export function usePeriodo(inicial: Periodo = 'mes') {
  const hoje = hojeISO()
  const [periodo, setPeriodo] = useState<Periodo>(inicial)
  const [livre, setLivre] = useState(() => intervalo(inicial === 'livre' ? 'mes' : inicial, hoje))
  const datas = periodo === 'livre' ? livre : intervalo(periodo, hoje)
  return { periodo, setPeriodo, livre, setLivre, datas }
}
