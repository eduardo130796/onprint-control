const UNIDADES: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }

/** Converte "15m", "1h", "7d" em milissegundos. */
export function duracaoEmMs(texto: string): number {
  const m = /^(\d+)([smhd])$/.exec(texto)
  if (!m) throw new Error(`Duração inválida: ${texto}`)
  return Number(m[1]) * (UNIDADES[m[2] as string] as number)
}
