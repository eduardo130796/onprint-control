import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/** Ex.: "terça-feira, 29 de setembro" */
export function formatarDataExtenso(data: Date): string {
  return format(data, "EEEE, d 'de' MMMM", { locale: ptBR })
}

/** Duração legível: 45 min, 3 h 20 min, 2 d 4 h. */
export function formatarDuracao(segundos: number): string {
  const min = Math.round(segundos / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`
  const d = Math.floor(h / 24)
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`
}

/** Valor para <input type="datetime-local"> a partir de um Date (horário local). */
export function paraDataHoraLocal(data: Date): string {
  return format(data, "yyyy-MM-dd'T'HH:mm")
}

/** Valor de <input type="datetime-local"> (horário do navegador) → ISO com fuso; vazio continua vazio. */
export function localParaIso(local: unknown): string {
  return typeof local === 'string' && local ? new Date(local).toISOString() : ''
}
