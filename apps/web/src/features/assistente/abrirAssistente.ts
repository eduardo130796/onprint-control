/** Abre a caixa "Peça ao Assistente" de qualquer lugar (a busca Ctrl+K usa para "Pedir ao Assistente: …") */
export const EVENTO_ABRIR_ASSISTENTE = 'grafygo:pedir-assistente'

export interface PedidoAbrirAssistente {
  texto?: string
  /** Já envia o texto (a pessoa escolheu "Pedir ao Assistente" na busca) */
  enviar?: boolean
}

export function abrirAssistente(pedido: PedidoAbrirAssistente = {}) {
  window.dispatchEvent(new CustomEvent<PedidoAbrirAssistente>(EVENTO_ABRIR_ASSISTENTE, { detail: pedido }))
}

/** O que foi digitado na busca parece um pedido (frase, pergunta ou CPF/CNPJ), não um nome ou número para localizar */
export function pareceFrase(termo: string): boolean {
  const t = termo.trim()
  if (t.length < 6) return false
  if (t.includes('?')) return true
  if (/^[\d\s./-]{14,}$/.test(t)) return true
  return t.split(/\s+/).length >= 3
}
