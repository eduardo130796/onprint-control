/** Título e descrição da aba (document.title, meta description) por página — funções puras, testadas */

/** Limite usual dos buscadores para a descrição */
export const MAX_DESCRICAO = 160

/** Texto em uma linha, cortado na última palavra inteira com reticências */
export function resumirTexto(texto: string | null | undefined, max = MAX_DESCRICAO): string {
  const t = (texto ?? '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const corte = t.slice(0, max - 1)
  const espaco = corte.lastIndexOf(' ')
  return `${(espaco > max * 0.5 ? corte.slice(0, espaco) : corte).replace(/[\s,;:.—–-]+$/, '')}…`
}

/** "Página · Loja" (sem página: só a loja) */
export function tituloAba(pagina: string | null | undefined, loja: string): string {
  const p = pagina?.trim()
  return p ? (loja ? `${p} · ${loja}` : p) : loja
}

interface Loja {
  nome: string
  slogan: string | null
  seoDescricao: string | null
}

/** Descrição padrão do site (início e páginas sem texto próprio) */
export function descricaoLoja(loja: Loja): string {
  return resumirTexto(loja.seoDescricao || loja.slogan || `${loja.nome} — produtos e orçamentos online. Monte sua lista e peça seu orçamento.`)
}

export function descricaoProdutos(loja: Loja, opcoes: { categoria?: { nome: string; quantidade: number } | null; busca?: string }): string {
  const { categoria, busca } = opcoes
  if (categoria) {
    const qtd = categoria.quantidade > 0 ? ` ${categoria.quantidade} ${categoria.quantidade === 1 ? 'produto' : 'produtos'}.` : ''
    return resumirTexto(`${categoria.nome} na ${loja.nome}.${qtd} Escolha as opções, monte sua lista e peça seu orçamento online.`)
  }
  if (busca) return resumirTexto(`Resultados para “${busca}” na ${loja.nome}. Monte sua lista e peça seu orçamento online.`)
  return resumirTexto(`Todos os produtos da ${loja.nome}. Escolha as opções, monte sua lista e peça seu orçamento online.`)
}

/** Produto: nome, preço exibido e o começo do texto de venda */
export function descricaoProduto(p: { nome: string; preco: string; texto: string | null; loja: string }): string {
  const inicio = `${p.nome} — ${p.preco}.`
  const resto = p.texto?.trim() ? ` ${p.texto}` : ` Peça seu orçamento na ${p.loja}.`
  return resumirTexto(inicio + resto)
}

export function descricaoLista(loja: Loja): string {
  return resumirTexto(`Sua lista de orçamento na ${loja.nome}: confira os itens e envie o pedido. A resposta chega pelo WhatsApp.`)
}
