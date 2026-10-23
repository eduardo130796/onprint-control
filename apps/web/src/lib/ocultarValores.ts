import { useSyncExternalStore } from 'react'

/**
 * "Ocultar valores" (o olho do topo, como nos apps de banco): borra na tela todo valor em dinheiro, para quando
 * alguém está olhando. Fica guardado neste navegador. Só a tela muda: PDFs, mensagens e páginas do cliente
 * continuam com os valores.
 *
 * Em vez de mexer em cada lugar que mostra valor, marca os elementos de texto curto com "R$ 123" (inclusive
 * em diálogos, gráficos e listas que chegam depois, via MutationObserver) e o CSS borra os marcados.
 */
const CHAVE = 'grafygo:ocultar-valores'
const CLASSE = 'ocultar-valores'
export const ATRIBUTO_VALOR = 'data-valor-oculto'
/** "R$ 1.234,56", "R$ -10", "R$ 2 mil": R$ seguido de número */
const DINHEIRO = /R\$\s*-?\s*\d/
/** Texto curto: um valor, um rótulo com valor ("Total: R$ 900,00"); nunca um bloco inteiro da página */
const MAX_TEXTO = 80

const ouvintes = new Set<() => void>()
let ativo = ler()
let observador: MutationObserver | null = null

function ler(): boolean {
  try {
    return localStorage.getItem(CHAVE) === '1'
  } catch {
    return false
  }
}

/** O texto de um elemento é um valor em dinheiro (ou um rótulo curto com valor) a borrar */
export const temValorEmDinheiro = (texto: string) => texto.length <= MAX_TEXTO && DINHEIRO.test(texto)

/** Marca o elemento que contém o texto, se o texto dele (curto) tem valor em dinheiro; desmarca se deixou de ter */
function avaliar(el: Element | null) {
  if (!el || el.closest('[data-mostrar-valor]')) return
  if (temValorEmDinheiro(el.textContent ?? '')) el.setAttribute(ATRIBUTO_VALOR, '')
  else if (el.hasAttribute(ATRIBUTO_VALOR)) el.removeAttribute(ATRIBUTO_VALOR)
}

function varrer(raiz: Node) {
  if (raiz.nodeType === Node.TEXT_NODE) return avaliar(raiz.parentElement)
  if (!(raiz instanceof Element)) return
  const caminhante = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT)
  for (let n = caminhante.nextNode(); n; n = caminhante.nextNode()) if (/\d/.test(n.nodeValue ?? '')) avaliar(n.parentElement)
}

function aplicar() {
  document.documentElement.classList.toggle(CLASSE, ativo)
  if (ativo && !observador) {
    varrer(document.body)
    observador = new MutationObserver((mudancas) => {
      for (const m of mudancas) {
        if (m.type === 'characterData') avaliar(m.target.parentElement)
        else m.addedNodes.forEach(varrer)
      }
    })
    observador.observe(document.body, { subtree: true, childList: true, characterData: true })
  } else if (!ativo && observador) {
    observador.disconnect()
    observador = null
    document.querySelectorAll(`[${ATRIBUTO_VALOR}]`).forEach((e) => e.removeAttribute(ATRIBUTO_VALOR))
  }
}

export function definirOcultarValores(valor: boolean) {
  ativo = valor
  try {
    localStorage.setItem(CHAVE, valor ? '1' : '0')
  } catch {
    // Sem armazenamento (aba privada): vale só até recarregar
  }
  aplicar()
  ouvintes.forEach((f) => f())
}

/** Liga o mecanismo com a preferência salva (chamar uma vez, no layout logado) e devolve o estado atual */
export function useOcultarValores() {
  const valor = useSyncExternalStore(
    (f) => {
      ouvintes.add(f)
      aplicar()
      return () => ouvintes.delete(f)
    },
    () => ativo,
  )
  return [valor, definirOcultarValores] as const
}
