import { useSyncExternalStore } from 'react'

/** A consulta de mídia vale agora? Acompanha mudanças de tamanho da janela (ex.: '(min-width: 1280px)'). */
export function useMediaQuery(consulta: string): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const m = window.matchMedia(consulta)
      m.addEventListener('change', avisar)
      return () => m.removeEventListener('change', avisar)
    },
    () => window.matchMedia(consulta).matches,
    () => false,
  )
}
