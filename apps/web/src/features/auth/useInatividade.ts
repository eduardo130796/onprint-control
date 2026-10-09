import { useEffect, useRef, useState } from 'react'

/** Último uso do sistema, compartilhado entre as abas (mexer numa mantém todas abertas). */
const CHAVE_ATIVIDADE = 'onprint:atividade'
/** Motivo da última saída, para a tela de login explicar (vale para todas as abas) */
export const CHAVE_MOTIVO_SAIDA = 'onprint:motivo-saida'

/** Marca que a saída foi por inatividade (antes de encerrar a sessão) */
export function registrarSaidaPorInatividade() {
  gravar(CHAVE_MOTIVO_SAIDA, Date.now())
}

/** Saiu por inatividade há pouco (últimos 10 min)? */
export function saiuPorInatividade(): boolean {
  const quando = ler(CHAVE_MOTIVO_SAIDA)
  return quando > 0 && Date.now() - quando < 10 * 60_000
}

/** Depois de mostrar a mensagem, apaga a marca */
export function esquecerMotivoSaida() {
  try {
    localStorage.removeItem(CHAVE_MOTIVO_SAIDA)
  } catch {
    // sem armazenamento
  }
}

/** Aviso antes de sair */
const AVISO_MS = 60_000
const EVENTOS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

function ler(chave: string): number {
  try {
    return Number(localStorage.getItem(chave)) || 0
  } catch {
    return 0
  }
}
function gravar(chave: string, valor: number) {
  try {
    localStorage.setItem(chave, String(valor))
  } catch {
    // sem armazenamento: cada aba conta a própria inatividade
  }
}

/**
 * Sai sozinho depois de `limiteMin` minutos sem uso (mouse, teclado, toque), com aviso 1 minuto antes.
 * O tempo conta pelo último uso em qualquer aba. O servidor também recusa renovar uma sessão parada além
 * do limite (aba fechada e reaberta depois), então isto é a parte visível da mesma regra.
 */
export function useInatividade({ limiteMin, ativo, aoExpirar }: { limiteMin: number; ativo: boolean; aoExpirar: () => void }) {
  const [restanteMs, setRestanteMs] = useState<number | null>(null)
  const ultimoLocal = useRef(Date.now())
  const expirou = useRef(false)
  const avisando = useRef(false)
  const aoExpirarRef = useRef(aoExpirar)
  aoExpirarRef.current = aoExpirar

  useEffect(() => {
    if (!ativo) return
    expirou.current = false
    const agora = Date.now()
    ultimoLocal.current = agora
    gravar(CHAVE_ATIVIDADE, agora)
    let ultimaGravacao = agora
    // Uso marca a atividade (no máximo a cada 5 s no armazenamento, para não pesar)
    const marcar = () => {
      if (avisando.current) return
      const t = Date.now()
      ultimoLocal.current = t
      if (t - ultimaGravacao > 5_000) {
        ultimaGravacao = t
        gravar(CHAVE_ATIVIDADE, t)
      }
    }
    for (const e of EVENTOS) window.addEventListener(e, marcar, { passive: true })
    const limiteMs = limiteMin * 60_000
    const verificar = () => {
      const ultimo = Math.max(ultimoLocal.current, ler(CHAVE_ATIVIDADE))
      const restante = limiteMs - (Date.now() - ultimo)
      if (restante <= 0) {
        if (!expirou.current) {
          expirou.current = true
          avisando.current = false
          setRestanteMs(null)
          aoExpirarRef.current()
        }
        return
      }
      avisando.current = restante <= AVISO_MS
      setRestanteMs(avisando.current ? restante : null)
    }
    const intervalo = window.setInterval(verificar, 1_000)
    // Voltar para a aba depois de muito tempo: confere na hora
    document.addEventListener('visibilitychange', verificar)
    return () => {
      for (const e of EVENTOS) window.removeEventListener(e, marcar)
      window.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', verificar)
      setRestanteMs(null)
    }
  }, [ativo, limiteMin])

  /** "Continuar conectado": conta como uso */
  function continuar() {
    const t = Date.now()
    avisando.current = false
    ultimoLocal.current = t
    gravar(CHAVE_ATIVIDADE, t)
    setRestanteMs(null)
  }

  return { restanteMs, continuar }
}
