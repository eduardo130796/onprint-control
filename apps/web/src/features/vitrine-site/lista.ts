import type { ItemPedidoVitrineInput, ModoCalculo, PrecoVitrine } from '@onprint/shared'

/**
 * Lista de orçamento do visitante: guardada no navegador, uma por vitrine (slug). Sem login; vira a Solicitação
 * quando o visitante envia. Tudo aqui é puro (sem React) para testar.
 */

export interface AcabamentoItem {
  id: string
  nome: string
  obrigatorio: boolean
}

export interface ItemLista {
  /** Identificador local (o mesmo produto pode entrar mais de uma vez, com medidas diferentes) */
  id: string
  produtoSlug: string
  nome: string
  capaUrl: string | null
  modoCalculo: ModoCalculo
  preco: PrecoVitrine
  quantidade: number
  /** Metros, decimal com ponto ("1.5"); só m² e metro linear */
  largura: string | null
  altura: string | null
  larguraMaxima: string | null
  alturaMaxima: string | null
  /** Acabamentos marcados */
  acabamentoIds: string[]
  /** Todos os acabamentos do produto (para editar na lista) */
  acabamentos: AcabamentoItem[]
  observacao: string
}

export const MAX_ITENS_LISTA = 30
const chave = (slug: string) => `grafygo:vitrine:${slug}:lista`

/** Armazenamento mínimo (localStorage ou um falso nos testes) */
export type Armazenamento = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function armazenamentoPadrao(): Armazenamento | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const texto = (v: unknown) => (typeof v === 'string' ? v : null)

/** Confere o formato de um item salvo (o navegador pode guardar lixo de outra versão) */
function itemValido(v: unknown): ItemLista | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const preco = o.preco as PrecoVitrine | undefined
  if (typeof o.id !== 'string' || typeof o.produtoSlug !== 'string' || typeof o.nome !== 'string') return null
  if (!preco || typeof preco !== 'object' || typeof preco.modo !== 'string') return null
  const quantidade = Math.trunc(Number(o.quantidade))
  return {
    id: o.id,
    produtoSlug: o.produtoSlug,
    nome: o.nome,
    capaUrl: texto(o.capaUrl),
    modoCalculo: (texto(o.modoCalculo) ?? 'unidade') as ModoCalculo,
    preco,
    quantidade: Number.isFinite(quantidade) && quantidade >= 1 ? quantidade : 1,
    largura: texto(o.largura),
    altura: texto(o.altura),
    larguraMaxima: texto(o.larguraMaxima),
    alturaMaxima: texto(o.alturaMaxima),
    acabamentoIds: Array.isArray(o.acabamentoIds) ? o.acabamentoIds.filter((a): a is string => typeof a === 'string') : [],
    acabamentos: Array.isArray(o.acabamentos)
      ? (o.acabamentos as AcabamentoItem[]).filter((a) => a && typeof a.id === 'string' && typeof a.nome === 'string')
      : [],
    observacao: texto(o.observacao) ?? '',
  }
}

export function lerLista(slug: string, armazenamento: Armazenamento | null = armazenamentoPadrao()): ItemLista[] {
  try {
    const bruto = armazenamento?.getItem(chave(slug))
    if (!bruto) return []
    const dados: unknown = JSON.parse(bruto)
    if (!Array.isArray(dados)) return []
    return dados.map(itemValido).filter((i): i is ItemLista => i !== null).slice(0, MAX_ITENS_LISTA)
  } catch {
    return []
  }
}

export function salvarLista(slug: string, itens: ItemLista[], armazenamento: Armazenamento | null = armazenamentoPadrao()): void {
  try {
    if (itens.length) armazenamento?.setItem(chave(slug), JSON.stringify(itens))
    else armazenamento?.removeItem(chave(slug))
  } catch {
    // navegador sem armazenamento (aba anônima, cota cheia): a lista vale só enquanto a página estiver aberta
  }
}

export const chaveLista = chave

export function novoIdItem(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

/** Mesmo produto com as mesmas escolhas: soma a quantidade em vez de repetir a linha */
function mesmaEscolha(a: ItemLista, b: ItemLista) {
  const ids = (i: ItemLista) => [...i.acabamentoIds].sort().join(',')
  return (
    a.produtoSlug === b.produtoSlug &&
    a.largura === b.largura &&
    a.altura === b.altura &&
    ids(a) === ids(b) &&
    a.observacao.trim() === b.observacao.trim()
  )
}

export function adicionarItem(itens: ItemLista[], novo: ItemLista): ItemLista[] {
  const igual = itens.find((i) => mesmaEscolha(i, novo))
  if (igual) return itens.map((i) => (i === igual ? { ...i, quantidade: Math.min(i.quantidade + novo.quantidade, 1_000_000) } : i))
  if (itens.length >= MAX_ITENS_LISTA) return itens
  return [...itens, novo]
}

export function atualizarItem(itens: ItemLista[], id: string, mudancas: Partial<Omit<ItemLista, 'id'>>): ItemLista[] {
  return itens.map((i) => (i.id === id ? { ...i, ...mudancas } : i))
}

export function removerItem(itens: ItemLista[], id: string): ItemLista[] {
  return itens.filter((i) => i.id !== id)
}

/** Itens no formato do envio (POST /pedidos); obrigatórios sempre vão, mesmo se sumirem da marcação */
export function itensParaPedido(itens: ItemLista[]): ItemPedidoVitrineInput[] {
  return itens.map((i) => {
    const obrigatorios = i.acabamentos.filter((a) => a.obrigatorio).map((a) => a.id)
    const medidas = i.modoCalculo === 'm2' || i.modoCalculo === 'metro_linear'
    return {
      produtoSlug: i.produtoSlug,
      quantidade: i.quantidade,
      largura: medidas ? i.largura : null,
      altura: medidas ? i.altura : null,
      acabamentoIds: [...new Set([...obrigatorios, ...i.acabamentoIds])],
      observacao: i.observacao.trim() || null,
    }
  })
}
