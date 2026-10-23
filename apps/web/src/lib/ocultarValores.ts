import { useSyncExternalStore } from 'react'

/**
 * "Ocultar valores" (o olho do topo, como nos apps de banco): borra na tela os valores em dinheiro, para quando
 * alguém está olhando. Fica guardado neste navegador. Só a tela muda: PDFs, mensagens e páginas do cliente
 * continuam com os valores.
 *
 * Alcance (menu da conta): "financeiro" (padrão) borra só o faturamento — painel inicial, financeiro, caixa,
 * relatórios e as abas financeiras marcadas com `data-financeiro` —, sem atrapalhar preços de orçamento e
 * produto; "todos" borra qualquer valor, inclusive campos de dinheiro (menos o que está sendo digitado).
 *
 * Em vez de mexer em cada lugar que mostra valor, marca os elementos de texto curto com "R$ 123" (inclusive
 * em diálogos, gráficos e listas que chegam depois, via MutationObserver) e o CSS borra os marcados.
 */
export type AlcanceOcultar = 'financeiro' | 'todos'

const CHAVE = 'grafygo:ocultar-valores'
const CHAVE_ALCANCE = 'grafygo:ocultar-valores-alcance'
const CLASSE = 'ocultar-valores'
const CLASSE_TODOS = 'ocultar-valores-todos'
export const ATRIBUTO_VALOR = 'data-valor-oculto'
/** "R$ 1.234,56", "R$ -10", "R$ 2 mil": R$ seguido de número */
const DINHEIRO = /R\$\s*-?\s*\d/
/** Texto curto: um valor, um rótulo com valor ("Total: R$ 900,00"); nunca um bloco inteiro da página */
const MAX_TEXTO = 80
/** Telas inteiras de faturamento: painel inicial, financeiro, caixa e relatórios */
const ROTA_FINANCEIRA = /^\/(?:$|financeiro|caixa|relatorios)(?:[/?#]|$)/

const ouvintes = new Set<() => void>()
let ativo = ler(CHAVE) === '1'
let alcance: AlcanceOcultar = ler(CHAVE_ALCANCE) === 'todos' ? 'todos' : 'financeiro'
let observador: MutationObserver | null = null

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}

function gravar(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor)
  } catch {
    // Sem armazenamento (aba privada): vale só até recarregar
  }
}

/** O texto de um elemento é um valor em dinheiro (ou um rótulo curto com valor) a borrar */
export const temValorEmDinheiro = (texto: string) => texto.length <= MAX_TEXTO && DINHEIRO.test(texto)

/** A rota é uma tela de faturamento (no alcance "financeiro", tudo nela é borrado) */
export const rotaFinanceira = (caminho: string) => ROTA_FINANCEIRA.test(caminho)

function noAlcance(el: Element) {
  return alcance === 'todos' || rotaFinanceira(window.location.pathname) || Boolean(el.closest('[data-financeiro]'))
}

/** Marca o elemento que contém o texto, se o texto dele (curto) tem valor em dinheiro; desmarca se deixou de ter */
function avaliar(el: Element | null) {
  if (!el || el.closest('[data-mostrar-valor]')) return
  if (temValorEmDinheiro(el.textContent ?? '') && noAlcance(el)) el.setAttribute(ATRIBUTO_VALOR, '')
  else if (el.hasAttribute(ATRIBUTO_VALOR)) el.removeAttribute(ATRIBUTO_VALOR)
}

function varrer(raiz: Node) {
  if (raiz.nodeType === Node.TEXT_NODE) return avaliar(raiz.parentElement)
  if (!(raiz instanceof Element)) return
  const caminhante = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT)
  for (let n = caminhante.nextNode(); n; n = caminhante.nextNode()) if (/\d/.test(n.nodeValue ?? '')) avaliar(n.parentElement)
}

function limpar() {
  document.querySelectorAll(`[${ATRIBUTO_VALOR}]`).forEach((e) => e.removeAttribute(ATRIBUTO_VALOR))
}

function aplicar() {
  document.documentElement.classList.toggle(CLASSE, ativo)
  document.documentElement.classList.toggle(CLASSE_TODOS, ativo && alcance === 'todos')
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
    limpar()
  }
}

function avisar() {
  ouvintes.forEach((f) => f())
}

export function definirOcultarValores(valor: boolean) {
  ativo = valor
  gravar(CHAVE, valor ? '1' : '0')
  aplicar()
  avisar()
}

export function definirAlcanceOcultar(valor: AlcanceOcultar) {
  alcance = valor
  gravar(CHAVE_ALCANCE, valor)
  // O alcance mudou: refaz as marcas da tela inteira
  if (ativo) {
    limpar()
    varrer(document.body)
  }
  aplicar()
  avisar()
}

function assinar(f: () => void) {
  ouvintes.add(f)
  aplicar()
  return () => {
    ouvintes.delete(f)
  }
}

/** Liga o mecanismo com a preferência salva (no layout logado) e devolve se está ocultando */
export function useOcultarValores() {
  const valor = useSyncExternalStore(assinar, () => ativo)
  return [valor, definirOcultarValores] as const
}

/** Alcance escolhido no menu da conta */
export function useAlcanceOcultar() {
  const valor = useSyncExternalStore(assinar, () => alcance)
  return [valor, definirAlcanceOcultar] as const
}
