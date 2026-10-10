/** Textos para compartilhar a vitrine e para as mensagens do WhatsApp (funções puras, testadas) */

/** Endereço canônico do produto no site (sem busca nem âncora) */
export function linkProduto(origem: string, produtoSlug: string): string {
  return `${origem.replace(/\/+$/, '')}/produto/${encodeURIComponent(produtoSlug)}`
}

/** Mensagem do "Chamar no WhatsApp" na página de um produto */
export function mensagemInteresse(produto: string, link: string): string {
  return `Olá! Tenho interesse no ${produto.trim()}: ${link}`
}

/** Mensagem do WhatsApp depois de enviar a lista de orçamento */
export function mensagemPedidoEnviado(numero: string): string {
  return `Olá! Acabei de enviar pelo site o pedido de orçamento ${numero}.`
}

export interface DadosCompartilhar {
  title: string
  text: string
  url: string
}

/** Dados para o Web Share (navigator.share): título com a loja, texto com nome e preço, e o link */
export function dadosCompartilharProduto(p: { nome: string; preco: string; loja: string; link: string }): DadosCompartilhar {
  const nome = p.nome.trim()
  const loja = p.loja.trim()
  return {
    title: loja ? `${nome} · ${loja}` : nome,
    text: [`${nome} — ${p.preco}`, loja && `Peça seu orçamento na ${loja}.`].filter(Boolean).join('\n'),
    url: p.link,
  }
}

/** Texto único (para WhatsApp e afins): o texto do compartilhamento seguido do link */
export function textoCompartilhar(dados: DadosCompartilhar): string {
  return `${dados.text}\n${dados.url}`
}

/** wa.me sem número: o próprio cliente escolhe para quem mandar */
export function linkWhatsappLivre(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`
}
