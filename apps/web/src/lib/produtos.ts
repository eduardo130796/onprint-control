import { MODO_CALCULO_SUFIXO, formatarMoeda, type ModoCalculo } from '@onprint/shared'

/** "R$ 65,00 / m²" */
export function formatarPrecoUnitario(valor: string | number | null | undefined, modo: ModoCalculo): string {
  return `${formatarMoeda(valor)} / ${MODO_CALCULO_SUFIXO[modo]}`
}

/** Medida em metros exibida no padrão brasileiro: "1,5 m" */
export function formatarMetros(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  return `${Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} m`
}
