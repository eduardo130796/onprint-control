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

const DIAS_DA_SEMANA: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 }

/**
 * O prazo que o cliente escreveu ("pra sexta", "dia 15", "15/11", "amanhã") como data AAAA-MM-DD, contada a partir de
 * `hoje` (fuso de São Paulo). Só quando dá para calcular com segurança: um dia da semana igual a hoje ("sexta" dito
 * numa sexta), "sexta que vem", "semana que vem", "fim do mês", data já passada ou duas datas diferentes no mesmo texto
 * são ambíguos e dão null (o texto continua nas observações internas para a equipe conferir).
 */
export function dataDoPrazo(texto: string | null | undefined, hoje = hojeISO()): string | null {
  if (!texto) return null
  const t = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  // "que vem", "próxima", "semana", "mês", "urgente": cada um entende de um jeito
  if (/\b(que vem|proxim[oa]|semana|mes|urgente|antes possivel|quanto antes|ou)\b/.test(t)) return null
  const datas = new Set<string>()
  if (/\bdepois de amanha\b/.test(t)) datas.add(adicionarDias(hoje, 2))
  else if (/\bamanha\b/.test(t)) datas.add(adicionarDias(hoje, 1))
  if (/\bhoje\b/.test(t)) datas.add(hoje)
  for (const m of t.matchAll(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/g)) {
    const alvo = DIAS_DA_SEMANA[m[1]!]!
    const diferenca = (alvo - diaDaSemana(hoje) + 7) % 7
    // O mesmo dia da semana de hoje: hoje ou daqui a uma semana? Não dá para saber
    if (diferenca === 0) return null
    datas.add(adicionarDias(hoje, diferenca))
  }
  const [ano, mes, dia] = partes(hoje)
  const valida = (a: number, m: number, d: number) => {
    const iso = new Date(Date.UTC(a, m - 1, d)).toISOString().slice(0, 10)
    return iso === `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` ? iso : null
  }
  for (const m of t.matchAll(/\b(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{2,4}))?\b/g)) {
    const a = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : ano
    const iso = valida(a, Number(m[2]), Number(m[1]))
    if (!iso || iso < hoje) return null
    datas.add(iso)
  }
  // "15 de novembro": o mês escrito (data já passada ou que não existe: ambíguo)
  const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  const comMes = new RegExp(`\\b(\\d{1,2}) de (${MESES.join('|')})\\b`, 'g')
  for (const m of t.matchAll(comMes)) {
    const iso = valida(ano, MESES.indexOf(m[2]!) + 1, Number(m[1]))
    if (!iso || iso < hoje) return null
    datas.add(iso)
  }
  for (const m of t.matchAll(new RegExp(`\\bdia (\\d{1,2})\\b(?!\\s*[/-]\\s*\\d)(?! de (${MESES.join('|')}))`, 'g'))) {
    const d = Number(m[1])
    // Dia que já passou neste mês: o mesmo dia do mês que vem
    const iso = d >= dia ? valida(ano, mes, d) : valida(mes === 12 ? ano + 1 : ano, mes === 12 ? 1 : mes + 1, d)
    if (!iso) return null
    datas.add(iso)
  }
  return datas.size === 1 ? [...datas][0]! : null
}
