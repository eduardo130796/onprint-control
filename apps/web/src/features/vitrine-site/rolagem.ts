/** Rolagem lateral das faixas do site (fora dos componentes, para o recarregamento rápido do Vite) */
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/** Onde está a rolagem lateral de um elemento (para as setas e o esmaecer nas bordas) */
export function useRolagemLateral<T extends HTMLElement>(dependencia?: unknown) {
  const ref = useRef<T>(null)
  const [pos, setPos] = useState({ inicio: true, fim: true })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setPos({ inicio: el.scrollLeft < 8, fim: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 })
    medir()
    el.addEventListener('scroll', medir, { passive: true })
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => {
      el.removeEventListener('scroll', medir)
      obs.disconnect()
    }
  }, [dependencia])
  return { ref, ...pos }
}

/** Esmaecer nas bordas de uma faixa rolável que ainda tem conteúdo escondido */
export function classesFade({ inicio, fim }: { inicio: boolean; fim: boolean }) {
  return cn(!inicio && 'vt-fade-inicio', !fim && 'vt-fade-fim')
}
