import { FUSO_HORARIO } from './format'

/** Data "YYYY-MM-DD" de hoje no fuso de São Paulo (datas de negócio não dependem do fuso do servidor). */
export function hojeISO(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_HORARIO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora)
}

function partes(iso: string): [number, number, number] {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  return [a as number, m as number, d as number]
}

/** Soma dias corridos a uma data "YYYY-MM-DD". */
export function adicionarDias(iso: string, dias: number): string {
  const [a, m, d] = partes(iso)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

/** Soma meses a uma data "YYYY-MM-DD"; dia que não existe no mês vira o último dia (31/01 + 1 = 28/02). */
export function adicionarMeses(iso: string, meses: number): string {
  const [a, m, d] = partes(iso)
  const ultimoDia = new Date(Date.UTC(a, m - 1 + meses + 1, 0)).getUTCDate()
  return new Date(Date.UTC(a, m - 1 + meses, Math.min(d, ultimoDia))).toISOString().slice(0, 10)
}

/** Dia da semana (0 = domingo, 6 = sábado) de uma data "YYYY-MM-DD". */
export function diaDaSemana(iso: string): number {
  const [a, m, d] = partes(iso)
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay()
}

/** Soma dias úteis (segunda a sexta). Com 0 dias, se cair no fim de semana vai para a segunda. */
export function adicionarDiasUteis(iso: string, dias: number): string {
  let data = iso.slice(0, 10)
  const util = (x: string) => diaDaSemana(x) !== 0 && diaDaSemana(x) !== 6
  while (!util(data)) data = adicionarDias(data, 1)
  for (let restantes = dias; restantes > 0; ) {
    data = adicionarDias(data, 1)
    if (util(data)) restantes--
  }
  return data
}

/** A data "YYYY-MM-DD" já passou em relação a hoje (São Paulo)? */
export function venceuAntesDeHoje(iso: string, hoje = hojeISO()): boolean {
  return iso.slice(0, 10) < hoje
}
