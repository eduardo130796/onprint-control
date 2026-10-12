import { CATEGORIAS_AJUDA, type CategoriaAjuda, type Tutorial } from '../tipos'
import { TUTORIAIS_COMECAR } from './comecar'
import { TUTORIAIS_FINANCEIRO_VITRINE } from './financeiro-vitrine'
import { TUTORIAIS_PEDIDOS } from './pedidos'
import { TUTORIAIS_VENDAS } from './vendas'

/** Todos os tutoriais, na ordem em que aparecem na central de ajuda */
export const TUTORIAIS: Tutorial[] = [...TUTORIAIS_COMECAR, ...TUTORIAIS_VENDAS, ...TUTORIAIS_PEDIDOS, ...TUTORIAIS_FINANCEIRO_VITRINE]

export function tutorialPorSlug(slug: string | undefined): Tutorial | undefined {
  return TUTORIAIS.find((t) => t.slug === slug)
}

/** Tutorial da tela aberta (botão "?"): o prefixo de rota mais específico ganha */
export function tutorialDaTela(caminho: string): Tutorial | undefined {
  let melhor: { t: Tutorial; tamanho: number } | undefined
  for (const t of TUTORIAIS) {
    for (const tela of t.telas) {
      if ((caminho === tela || caminho.startsWith(`${tela}/`)) && tela.length > (melhor?.tamanho ?? -1)) melhor = { t, tamanho: tela.length }
    }
  }
  return melhor?.t
}

/** Agrupados por categoria (só as que têm tutorial), na ordem das categorias */
export function tutoriaisPorCategoria(lista: Tutorial[] = TUTORIAIS) {
  return (Object.keys(CATEGORIAS_AJUDA) as CategoriaAjuda[])
    .map((c) => ({ categoria: c, ...CATEGORIAS_AJUDA[c], tutoriais: lista.filter((t) => t.categoria === c) }))
    .filter((g) => g.tutoriais.length > 0)
}

/** Busca simples: título, resumo e texto dos passos, sem acento e sem maiúsculas */
export function buscarTutoriais(texto: string): Tutorial[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const termos = norm(texto).split(/\s+/).filter(Boolean)
  if (!termos.length) return TUTORIAIS
  return TUTORIAIS.filter((t) => {
    const alvo = norm([t.titulo, t.resumo, ...t.passos.flatMap((p) => [p.titulo, p.texto])].join(' '))
    return termos.every((x) => alvo.includes(x))
  })
}
