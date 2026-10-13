/** Rolagem lateral das faixas do site (fora dos componentes, para o recarregamento rápido do Vite) */
import { useCallback, useEffect, useRef, useState } from 'react'
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

/** Visitante pediu menos animação no sistema */
export const reduzirMovimento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * Faixa de slides com scroll-snap (banners, fotos do produto): o dedo arrasta de verdade, como num aplicativo.
 * Diz qual slide está na vista e leva a outro (dá a volta nas pontas).
 */
export function useSlides<T extends HTMLElement>(n: number) {
  const ref = useRef<T>(null)
  const [atual, setAtual] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let quadro = 0
    const medir = () => {
      cancelAnimationFrame(quadro)
      quadro = requestAnimationFrame(() => {
        const w = el.clientWidth
        if (w) setAtual(Math.min(n - 1, Math.max(0, Math.round(el.scrollLeft / w))))
      })
    }
    el.addEventListener('scroll', medir, { passive: true })
    return () => {
      el.removeEventListener('scroll', medir)
      cancelAnimationFrame(quadro)
    }
  }, [n])
  const ir = useCallback(
    (i: number) => {
      const el = ref.current
      if (!el || !n) return
      const alvo = ((i % n) + n) % n
      el.scrollTo({ left: alvo * el.clientWidth, behavior: reduzirMovimento() ? 'auto' : 'smooth' })
    },
    [n],
  )
  return { ref, atual, ir }
}
