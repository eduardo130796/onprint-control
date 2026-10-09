import type { MouseEvent } from 'react'

/**
 * Clique numa linha de lista: abre o painel lateral (resumo + ações) sem sair da lista.
 * Ctrl/Cmd+clique (ou botão do meio) abre a tela completa em outra aba, como num link.
 */
export function abrirLinha(evento: MouseEvent, caminho: string, abrirPainel: () => void) {
  if (evento.ctrlKey || evento.metaKey || evento.button === 1) {
    window.open(caminho, '_blank', 'noopener')
    return
  }
  abrirPainel()
}
