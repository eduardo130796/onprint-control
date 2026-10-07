import type { StatusConfig } from '@onprint/shared'

/**
 * Colunas dos kanbans com status próprios: cada status próprio "conta como" um status do sistema (base)
 * e vira uma coluna ao lado dela. O registro fica na coluna própria enquanto o status dele for a base.
 */

/** Status da entidade na ordem do quadro (ordem; empate: o do sistema primeiro, depois o próprio). */
export function ordenarStatus(lista: StatusConfig[]) {
  return [...lista].sort((a, b) => a.ordem - b.ordem || Number(b.sistema) - Number(a.sistema) || a.rotulo.localeCompare(b.rotulo))
}

/** Código da coluna do registro: a própria (se ainda vale para o status atual) ou a do sistema. */
export function colunaDoRegistro(status: StatusConfig[], base: string, personalizadoId: string | null | undefined) {
  if (personalizadoId) {
    const proprio = status.find((s) => s.id === personalizadoId)
    if (proprio && proprio.base === base) return proprio.codigo
  }
  return base
}

/** Status próprio válido do registro (id), ou null. */
export function personalizadoValido(status: StatusConfig[], base: string, personalizadoId: string | null | undefined) {
  const codigo = colunaDoRegistro(status, base, personalizadoId)
  return codigo === base ? null : (status.find((s) => s.codigo === codigo)?.id ?? null)
}

/** O que uma coluna representa: o status do sistema (base) e, se for própria, o id dela. */
export function destinoDaColuna(status: StatusConfig[], codigo: string): { base: string; personalizadoId: string | null } {
  const s = status.find((x) => x.codigo === codigo)
  if (s && !s.sistema && s.base) return { base: s.base, personalizadoId: s.id }
  return { base: codigo, personalizadoId: null }
}

/**
 * Colunas do quadro com os registros distribuídos. Coluna oculta só aparece se tiver cartões
 * (para nada sumir da vista); o título ganha "(oculto)" nesse caso.
 */
export function montarColunas<T>(status: StatusConfig[], itens: T[], baseDe: (i: T) => string, personalizadoDe: (i: T) => string | null | undefined) {
  const porColuna = new Map<string, T[]>()
  for (const i of itens) {
    const c = colunaDoRegistro(status, baseDe(i), personalizadoDe(i))
    porColuna.set(c, [...(porColuna.get(c) ?? []), i])
  }
  return ordenarStatus(status)
    .filter((s) => s.ativo || (porColuna.get(s.codigo)?.length ?? 0) > 0)
    .map((s) => ({ id: s.codigo, titulo: s.ativo ? s.rotulo : `${s.rotulo} (oculto)`, cor: s.cor, itens: porColuna.get(s.codigo) ?? [] }))
}
