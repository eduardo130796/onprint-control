import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check, Link2, Share, Share2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { linkWhatsappLivre, textoCompartilhar, type DadosCompartilhar } from '../compartilhar'
import { botao } from '../estilos'
import { IconeWhatsapp } from './icones'

/** Celular/tablet com a folha nativa de compartilhar (no computador o menu próprio é mais útil) */
function temFolhaNativa(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
  return window.matchMedia?.('(pointer: coarse)').matches ?? false
}

async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    // Sem a API (ou sem permissão): seleção num campo escondido
    const campo = document.createElement('textarea')
    campo.value = texto
    campo.setAttribute('readonly', '')
    campo.style.position = 'fixed'
    campo.style.opacity = '0'
    document.body.appendChild(campo)
    campo.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    campo.remove()
    return ok
  }
}

const item =
  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[0.9375rem] font-medium text-slate-800 transition hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none'

/** Botão "Compartilhar": folha nativa no celular; no computador, menu com WhatsApp e copiar link */
export function BotaoCompartilhar({ dados, className }: { dados: DadosCompartilhar; className?: string }) {
  const [aberto, setAberto] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const gatilho = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const idMenu = useId()

  const itensMenu = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
  const fechar = (devolverFoco = true) => {
    setAberto(false)
    if (devolverFoco) gatilho.current?.focus()
  }

  // Fecha ao clicar fora; foca o primeiro item ao abrir
  useEffect(() => {
    if (!aberto) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true })
    // No celular o menu pode abrir no pé da tela: traz para a vista inteiro
    menu.current?.scrollIntoView({ block: 'nearest' })
    const fora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('pointerdown', fora)
    return () => document.removeEventListener('pointerdown', fora)
  }, [aberto])

  useEffect(() => {
    if (!copiado) return
    const t = window.setTimeout(() => setCopiado(false), 2200)
    return () => window.clearTimeout(t)
  }, [copiado])

  const compartilhar = async () => {
    if (temFolhaNativa()) {
      try {
        await navigator.share(dados)
        return
      } catch (e) {
        // Cancelado pela pessoa: nada a fazer; outra falha: cai no menu
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    setAberto((a) => !a)
  }

  const copiar = async () => {
    if (await copiarTexto(dados.url)) setCopiado(true)
  }

  const teclas = (e: KeyboardEvent) => {
    const lista = itensMenu()
    const i = lista.indexOf(document.activeElement as HTMLElement)
    const ir = (n: number) => {
      e.preventDefault()
      lista[(n + lista.length) % lista.length]?.focus()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      fechar()
    } else if (e.key === 'ArrowDown') ir(i + 1)
    else if (e.key === 'ArrowUp') ir(i - 1)
    else if (e.key === 'Home') ir(0)
    else if (e.key === 'End') ir(lista.length - 1)
    else if (e.key === 'Tab') setAberto(false)
  }

  return (
    <div ref={raiz} className={cn('relative', className)}>
      <button
        ref={gatilho}
        type="button"
        onClick={() => void compartilhar()}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? idMenu : undefined}
        className={cn(botao.base, botao.contorno, 'h-11 w-11 text-sm sm:w-auto sm:px-4', aberto && 'border-slate-900 bg-slate-50')}
      >
        <Share2 />
        <span className="sr-only sm:not-sr-only">Compartilhar</span>
      </button>
      {aberto && (
        <div
          ref={menu}
          id={idMenu}
          role="menu"
          aria-label="Compartilhar produto"
          onKeyDown={teclas}
          className="vt-surgir absolute right-0 top-full z-50 mt-2 w-[min(17rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_1.5rem_3rem_-1rem_rgba(15,23,42,0.28)]"
        >
          <p className="px-3 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500" aria-hidden="true">
            Compartilhar
          </p>
          <a
            role="menuitem"
            href={linkWhatsappLivre(textoCompartilhar(dados))}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => fechar(false)}
            className={item}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#25D366]/15 text-[#128C4B]">
              <IconeWhatsapp className="h-[1.125rem] w-[1.125rem]" />
            </span>
            Enviar no WhatsApp
          </a>
          <button role="menuitem" type="button" onClick={() => void copiar()} className={item}>
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition',
                copiado ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700',
              )}
            >
              {copiado ? <Check className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.5} aria-hidden="true" /> : <Link2 className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />}
            </span>
            <span className={cn(copiado && 'text-emerald-700')}>{copiado ? 'Link copiado!' : 'Copiar link'}</span>
          </button>
          {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                fechar()
                navigator.share(dados).catch(() => undefined)
              }}
              className={item}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                <Share className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
              </span>
              Mais opções…
            </button>
          )}
          <span className="sr-only" aria-live="polite">
            {copiado ? 'Link copiado' : ''}
          </span>
        </div>
      )}
    </div>
  )
}
