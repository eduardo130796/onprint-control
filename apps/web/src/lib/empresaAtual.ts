/**
 * Slug da empresa do usuário logado, para montar links públicos (aprovação de orçamento e de arte)
 * também fora de componentes React, como no PDF do orçamento. Atualizado pelo AuthProvider.
 */
let slugAtual = ''

export function definirEmpresaAtual(slug: string) {
  slugAtual = slug
}

/** Link público de um documento da empresa logada: {origem}/{rota}/{empresa}/{token}. */
export function linkPublico(rota: 'aprovar' | 'arte', token: string): string {
  return `${window.location.origin}/${rota}/${encodeURIComponent(slugAtual)}/${token}`
}
