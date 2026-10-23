import { useSyncExternalStore } from 'react'
import { OCULTAR_VALORES_PADRAO, type OcultarValoresPrefs } from '@onprint/shared'

/**
 * "Ocultar valores" (o olho do topo, como nos apps de banco): borra na tela os valores em dinheiro, para quando
 * alguém está olhando. Ligar/desligar fica neste navegador (é coisa do momento e do lugar: o balcão, a TV);
 * o QUE esconder é preferência da conta (Aparência), e vale em qualquer computador. Só a tela muda: PDFs,
 * mensagens e páginas do cliente continuam com os valores.
 *
 * Em vez de mexer em cada lugar que mostra valor, marca os elementos de texto curto com "R$ 123" (inclusive
 * em diálogos, gráficos e listas que chegam depois, via MutationObserver) e o CSS borra os marcados. Cada valor
 * cai numa área pela rota (painel, financeiro, orçamentos, pedidos, produtos) e, onde importa, num tipo marcado
 * no elemento: `data-valor-tipo="total"` (valor final: total do orçamento/pedido) e `data-valor-tipo="custo"`
 * (custo, lucro e margem; o elemento inteiro é borrado, mesmo um "Lucro de 61,5%" sem R$). Abas financeiras
 * dentro de outras telas usam `data-financeiro`; listas de outra área dentro de uma tela (os orçamentos na ficha do
 * cliente) usam `data-valor-area="orcamentos"`; `data-mostrar-valor` nunca é borrado.
 */
export type AreaValor = 'painel' | 'financeiro' | 'orcamentos' | 'pedidos' | 'produtos'
export type TipoValor = 'total' | 'custo'

const CHAVE = 'grafygo:ocultar-valores'
/** Alcance antigo (antes da escolha por conta): "todos" vira tudo ligado, uma vez */
const CHAVE_ALCANCE_ANTIGA = 'grafygo:ocultar-valores-alcance'
const CLASSE = 'ocultar-valores'
const CLASSE_CAMPOS = 'ocultar-valores-campos'
export const ATRIBUTO_VALOR = 'data-valor-oculto'
/** "R$ 1.234,56", "R$ -10", "R$ 2 mil": R$ seguido de número */
const DINHEIRO = /R\$\s*-?\s*\d/
/** Texto curto: um valor, um rótulo com valor ("Total: R$ 900,00"); nunca um bloco inteiro da página */
const MAX_TEXTO = 80
const AREAS: [RegExp, AreaValor][] = [
  [/^\/$/, 'painel'],
  [/^\/(?:financeiro|caixa|relatorios)(?:\/|$)/, 'financeiro'],
  // Solicitações e kanban de orçamentos também
  [/^\/orcamentos(?:\/|$)/, 'orcamentos'],
  // Pedidos, entregas, produção (cartões e ordens mostram o valor do pedido), PCP e pedidos do site
  [/^\/(?:pedidos|producao|pcp|vitrine\/pedidos)(?:\/|$)/, 'pedidos'],
  // Produtos, insumos, acabamentos, reajuste, estoque (custo dos insumos) e o catálogo da vitrine
  [/^\/(?:produtos|estoque|vitrine\/produtos)(?:\/|$)/, 'produtos'],
]

const ouvintes = new Set<() => void>()
let ativo = ler(CHAVE) === '1'
let prefs: OcultarValoresPrefs = OCULTAR_VALORES_PADRAO
let observador: MutationObserver | null = null

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}

function gravar(chave: string, valor: string | null) {
  try {
    if (valor === null) localStorage.removeItem(chave)
    else localStorage.setItem(chave, valor)
  } catch {
    // Sem armazenamento (aba privada): vale só até recarregar
  }
}

/** O texto de um elemento é um valor em dinheiro (ou um rótulo curto com valor) a borrar */
export const temValorEmDinheiro = (texto: string) => texto.length <= MAX_TEXTO && DINHEIRO.test(texto)

/** Área da tela pela rota (null: telas sem valores a esconder por padrão, como clientes e configurações) */
export const areaDaRota = (caminho: string): AreaValor | null => AREAS.find(([re]) => re.test(caminho))?.[1] ?? null

/**
 * A regra: um valor em dinheiro (ou um elemento de custo) nesta rota, com este tipo, deve ser borrado?
 * Custo/lucro/margem segue a sua opção em qualquer tela; aba financeira segue "financeiro" em qualquer tela;
 * no resto vale a área da rota (orçamentos e pedidos: "totais" só o valor final, "tudo" qualquer valor).
 */
export function deveOcultar({
  rota,
  area: areaMarcada,
  tipo,
  dentroFinanceiro,
  prefs: p,
}: {
  rota: string
  /** Área marcada no elemento (`data-valor-area`): vale no lugar da área da rota */
  area?: AreaValor | null
  tipo?: TipoValor | null
  dentroFinanceiro?: boolean
  prefs: OcultarValoresPrefs
}): boolean {
  if (tipo === 'custo' && p.custoLucro) return true
  if (dentroFinanceiro && p.financeiro) return true
  const area = areaMarcada ?? areaDaRota(rota)
  if (area === 'orcamentos' || area === 'pedidos') return p[area] === 'tudo' || (p[area] === 'totais' && tipo === 'total')
  return area ? p[area] : false
}

function marcar(el: Element, sim: boolean) {
  if (sim) el.setAttribute(ATRIBUTO_VALOR, '')
  else if (el.hasAttribute(ATRIBUTO_VALOR)) el.removeAttribute(ATRIBUTO_VALOR)
}

/** Elemento de custo/lucro/margem: borra o bloco inteiro (inclusive percentuais sem R$) */
function avaliarCusto(el: Element) {
  if (el.closest('[data-mostrar-valor]')) return
  marcar(el, prefs.custoLucro)
}

/** Marca o elemento que contém o texto, se o texto dele (curto) tem valor em dinheiro a borrar; desmarca se não */
function avaliar(el: Element | null) {
  if (!el || el.closest('[data-mostrar-valor]')) return
  const marcado = el.closest('[data-valor-tipo]')
  const tipo = (marcado?.getAttribute('data-valor-tipo') ?? null) as TipoValor | null
  // Dentro de um custo já borrado inteiro: não borra de novo (o desfoque somaria)
  if (tipo === 'custo' && prefs.custoLucro && marcado !== el) return marcar(el, false)
  // Marcado como total ou custo, vale mesmo num texto mais longo ("Entrada de R$ 250,00 na aprovação e …")
  const texto = el.textContent ?? ''
  const sim =
    (tipo ? DINHEIRO.test(texto) : temValorEmDinheiro(texto)) &&
    deveOcultar({
      rota: window.location.pathname,
      area: (el.closest('[data-valor-area]')?.getAttribute('data-valor-area') ?? null) as AreaValor | null,
      tipo,
      dentroFinanceiro: Boolean(el.closest('[data-financeiro]')),
      prefs,
    })
  marcar(el, sim || (tipo === 'custo' && marcado === el && prefs.custoLucro))
}

function varrer(raiz: Node) {
  if (raiz.nodeType === Node.TEXT_NODE) return avaliar(raiz.parentElement)
  if (!(raiz instanceof Element)) return
  if (raiz.matches('[data-valor-tipo="custo"]')) avaliarCusto(raiz)
  raiz.querySelectorAll('[data-valor-tipo="custo"]').forEach(avaliarCusto)
  const caminhante = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT)
  for (let n = caminhante.nextNode(); n; n = caminhante.nextNode()) if (/\d/.test(n.nodeValue ?? '')) avaliar(n.parentElement)
}

function limpar() {
  document.querySelectorAll(`[${ATRIBUTO_VALOR}]`).forEach((e) => e.removeAttribute(ATRIBUTO_VALOR))
}

/** Refaz as marcas da tela inteira (mudou a escolha ou a rota) */
export function revarrerValores() {
  if (!ativo) return
  limpar()
  varrer(document.body)
}

function aplicar() {
  document.documentElement.classList.toggle(CLASSE, ativo)
  document.documentElement.classList.toggle(CLASSE_CAMPOS, ativo && prefs.campos)
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

/** O que esconder (preferência da conta, aplicada pelo layout logado): com o olho ligado, muda na hora */
export function aplicarPrefsOcultar(novas: OcultarValoresPrefs) {
  if (JSON.stringify(novas) === JSON.stringify(prefs)) return
  prefs = novas
  revarrerValores()
  aplicar()
}

/**
 * Quem tinha escolhido "Todos os valores" no menu antigo (guardado neste navegador): devolve true uma vez,
 * para a conta passar a esconder tudo; depois a chave antiga some.
 */
export function migrarAlcanceAntigo(): boolean {
  const antigo = ler(CHAVE_ALCANCE_ANTIGA)
  if (antigo === null) return false
  gravar(CHAVE_ALCANCE_ANTIGA, null)
  return antigo === 'todos'
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
