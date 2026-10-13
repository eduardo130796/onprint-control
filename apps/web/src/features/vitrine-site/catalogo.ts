import type { ProdutoCardVitrine } from '@onprint/shared'

/** Catálogo no site: capa das categorias e ordem da lista de produtos (funções puras, testadas) */

/** Foto de cada categoria: a capa do primeiro produto dela que tem foto (na ordem em que chegaram) */
export function capasDasCategorias(produtos: ProdutoCardVitrine[]): Map<string, string> {
  const capas = new Map<string, string>()
  for (const p of produtos) {
    if (p.categoria && p.capaUrl && !capas.has(p.categoria.id)) capas.set(p.categoria.id, p.capaUrl)
  }
  return capas
}

export const ORDENS_PRODUTOS = [
  { valor: 'padrao', rotulo: 'Em destaque' },
  { valor: 'menor-preco', rotulo: 'Menor preço' },
  { valor: 'maior-preco', rotulo: 'Maior preço' },
  { valor: 'nome', rotulo: 'Nome (A–Z)' },
] as const
export type OrdemProdutos = (typeof ORDENS_PRODUTOS)[number]['valor']

export function lerOrdem(valor: string | null | undefined): OrdemProdutos {
  return ORDENS_PRODUTOS.some((o) => o.valor === valor) ? (valor as OrdemProdutos) : 'padrao'
}

/** Preço para ordenar; sob consulta (sem valor) vai sempre para o fim */
const precoDe = (p: ProdutoCardVitrine) => {
  const n = p.preco.modo === 'sob_consulta' || p.preco.valor === null ? NaN : Number(p.preco.valor)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Reordena uma página de produtos (a API já manda na ordem da gráfica, "padrao"). Só faz sentido quando todos os
 * produtos cabem numa página: quem chama esconde a opção quando há mais de uma.
 */
export function ordenarProdutos(produtos: ProdutoCardVitrine[], ordem: OrdemProdutos): ProdutoCardVitrine[] {
  if (ordem === 'padrao') return produtos
  const copia = [...produtos]
  if (ordem === 'nome') return copia.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const sinal = ordem === 'menor-preco' ? 1 : -1
  return copia.sort((a, b) => {
    const pa = precoDe(a)
    const pb = precoDe(b)
    if (pa === null || pb === null) return pa === pb ? 0 : pa === null ? 1 : -1
    return (pa - pb) * sinal
  })
}
