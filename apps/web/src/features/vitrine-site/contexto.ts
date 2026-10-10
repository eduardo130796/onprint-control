import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { VitrinePublica } from '@onprint/shared'
import type { VitrineApi } from './api'
import { linkWhatsapp } from './formato'
import { descricaoLoja, tituloAba } from './seo'
import { adicionarItem, atualizarItem, chaveLista, lerLista, removerItem, salvarLista, type ItemLista } from './lista'

export interface ListaOrcamento {
  itens: ItemLista[]
  /** Devolve false quando a lista já está cheia */
  adicionar: (item: ItemLista) => boolean
  atualizar: (id: string, mudancas: Partial<Omit<ItemLista, 'id'>>) => void
  remover: (id: string) => void
  limpar: () => void
}

export interface ContextoVitrine {
  slug: string
  api: VitrineApi
  vitrine: VitrinePublica
  lista: ListaOrcamento
  /** wa.me da gráfica com a mensagem pronta (ou outra); null sem WhatsApp configurado */
  whatsapp: (mensagem?: string) => string | null
  /** Mensagem do WhatsApp da página atual (produto, pedido enviado) para o topo e o botão flutuante; null = a da loja */
  mensagemPagina: string | null
  definirMensagemPagina: (mensagem: string | null) => void
}

export const VitrineContexto = createContext<ContextoVitrine | null>(null)

export function useVitrine(): ContextoVitrine {
  const ctx = useContext(VitrineContexto)
  if (!ctx) throw new Error('useVitrine fora da vitrine')
  return ctx
}

/** Lista de orçamento guardada no navegador; acompanha outras abas da mesma vitrine */
export function useListaOrcamento(slug: string): ListaOrcamento {
  const [itens, setItens] = useState<ItemLista[]>(() => lerLista(slug))

  useEffect(() => {
    const aoMudar = (e: StorageEvent) => {
      if (e.key === chaveLista(slug)) setItens(lerLista(slug))
    }
    window.addEventListener('storage', aoMudar)
    return () => window.removeEventListener('storage', aoMudar)
  }, [slug])

  const mudar = useCallback(
    (f: (atual: ItemLista[]) => ItemLista[]) =>
      setItens((atual) => {
        const novo = f(atual)
        salvarLista(slug, novo)
        return novo
      }),
    [slug],
  )

  return useMemo(
    () => ({
      itens,
      adicionar: (item) => {
        const proximo = adicionarItem(itens, item)
        if (proximo === itens) return false
        mudar(() => proximo)
        return true
      },
      atualizar: (id, mudancas) => mudar((a) => atualizarItem(a, id, mudancas)),
      remover: (id) => mudar((a) => removerItem(a, id)),
      limpar: () => mudar(() => []),
    }),
    [itens, mudar],
  )
}

export function criarLinkWhatsapp(vitrine: VitrinePublica) {
  const padrao = vitrine.empresa.mensagemWhatsapp || 'Olá! Vim pelo site e gostaria de fazer um orçamento.'
  return (mensagem?: string) => (vitrine.empresa.whatsapp ? linkWhatsapp(vitrine.empresa.whatsapp, mensagem ?? padrao) : null)
}

/** Meta tag do <head> (cria se faltar); sem conteúdo, não mexe */
export function definirMeta(nome: string, conteudo: string | null) {
  if (!conteudo) return
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${nome}"]`)
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = nome
    document.head.appendChild(meta)
  }
  meta.content = conteudo
}

/** Título da aba ("Página · Gráfica") e descrição da página (sem descrição: a da loja) */
export function useTituloPagina(titulo: string | null | undefined, descricao?: string | null) {
  const ctx = useContext(VitrineContexto)
  const empresa = ctx?.vitrine.empresa
  const nome = empresa?.nome || ''
  const padrao = empresa ? descricaoLoja(empresa) : null
  useEffect(() => {
    document.title = tituloAba(titulo, nome)
    definirMeta('description', descricao || padrao)
  }, [titulo, nome, descricao, padrao])
}

/** A página leva a sua mensagem ao WhatsApp do topo e do botão flutuante enquanto está aberta */
export function useMensagemWhatsappPagina(mensagem: string | null | undefined) {
  const definir = useContext(VitrineContexto)?.definirMensagemPagina
  useEffect(() => {
    if (!definir || !mensagem) return
    definir(mensagem)
    return () => definir(null)
  }, [definir, mensagem])
}

/** wa.me para os botões gerais (topo, flutuante): a mensagem da página atual ou a da loja */
export function useWhatsappGeral(): string | null {
  const { whatsapp, mensagemPagina } = useVitrine()
  return whatsapp(mensagemPagina ?? undefined)
}
