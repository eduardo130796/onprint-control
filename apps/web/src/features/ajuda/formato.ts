/** "1min 12s" ou "45s" (duração dos vídeos dos tutoriais) */
export function formatarDuracao(segundos: number) {
  const m = Math.floor(segundos / 60)
  const s = segundos % 60
  return m ? `${m}min${s ? ` ${String(s).padStart(2, '0')}s` : ''}` : `${s}s`
}
