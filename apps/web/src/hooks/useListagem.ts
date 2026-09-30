import { useState } from 'react'
import { useDebounce } from './useDebounce'

/**
 * Estado padrão das listagens paginadas no servidor: página, tamanho, ordenação, busca e filtros.
 * Mudar busca ou filtro volta para a página 1.
 */
export function useListagem<F extends Record<string, string | undefined>>(filtrosIniciais: F, pageSizeInicial = 20) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSizeEstado] = useState(pageSizeInicial)
  const [sort, setSortEstado] = useState<string | undefined>()
  const [busca, setBuscaEstado] = useState('')
  const [filtros, setFiltrosEstado] = useState<F>(filtrosIniciais)
  const buscaAtrasada = useDebounce(busca.trim())

  return {
    page,
    pageSize,
    sort,
    busca,
    filtros,
    /** Parâmetros prontos para a query da API. */
    params: { page, pageSize, sort, busca: buscaAtrasada || undefined, ...filtros },
    setPage,
    setPageSize: (n: number) => {
      setPageSizeEstado(n)
      setPage(1)
    },
    setSort: (s: string | undefined) => {
      setSortEstado(s)
      setPage(1)
    },
    setBusca: (b: string) => {
      setBuscaEstado(b)
      setPage(1)
    },
    setFiltro: <K extends keyof F>(chave: K, valor: F[K]) => {
      setFiltrosEstado((f) => ({ ...f, [chave]: valor }))
      setPage(1)
    },
  }
}

export type Listagem = ReturnType<typeof useListagem>
