import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { VitrinePublica } from '@onprint/shared'
import type { VitrineApi } from './api'
import { linkWhatsapp } from './formato'
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

/** Título da aba: "Página · Gráfica" */
export function useTituloPagina(titulo: string | null | undefined) {
  const ctx = useContext(VitrineContexto)
  const nome = ctx?.vitrine.empresa.nome || ''
  useEffect(() => {
    document.title = titulo ? `${titulo} · ${nome}` : nome
  }, [titulo, nome])
}
