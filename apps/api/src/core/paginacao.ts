import type { Paginado } from '@onprint/shared'

interface QueryPaginada {
  page: number
  pageSize: number
  sort?: string
}

/**
 * Converte ?page, ?pageSize e ?sort=campo:asc em skip/take/orderBy do Prisma.
 * Só aceita ordenação pelos campos permitidos; caso contrário usa o padrão.
 */
export function paginacao<Campo extends string>(
  query: QueryPaginada,
  camposOrdenaveis: readonly Campo[],
  padrao: { campo: Campo; direcao: 'asc' | 'desc' },
) {
  const [campo, direcao] = (query.sort ?? '').split(':') as [string, string | undefined]
  const valido = (camposOrdenaveis as readonly string[]).includes(campo) && (direcao === 'asc' || direcao === 'desc')
  return {
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
    orderBy: valido ? { [campo]: direcao } : { [padrao.campo]: padrao.direcao },
  }
}

export function paginado<T>(data: T[], total: number, query: QueryPaginada): Paginado<T> {
  return { data, meta: { page: query.page, pageSize: query.pageSize, total } }
}

/** Filtro "ativo" padrão das listagens de cadastro (true | false | todos). */
export function filtroAtivo(ativo: 'true' | 'false' | 'todos') {
  return ativo === 'todos' ? {} : { ativo: ativo === 'true' }
}
