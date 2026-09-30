import { useQuery } from '@tanstack/react-query'
import { categoriasFinanceirasApi, contasFinanceirasApi, formasApi } from '@/api/financeiro'

const LONGO = 5 * 60 * 1000

export function useFormasPagamento() {
  return useQuery({ queryKey: ['financeiro-formas', 'ativas'], queryFn: () => formasApi.listar({ pageSize: 100, ativo: 'true' }), staleTime: LONGO, select: (r) => r.data })
}

export function useContasFinanceiras() {
  return useQuery({ queryKey: ['financeiro-contas', 'ativas'], queryFn: () => contasFinanceirasApi.listar({ pageSize: 100, ativo: 'true' }), staleTime: LONGO, select: (r) => r.data })
}

/** Categorias ativas de um tipo, com o nome do pai ("Despesas operacionais › Aluguel"). */
export function useCategoriasFinanceiras(tipo: 'receita' | 'despesa') {
  return useQuery({
    queryKey: ['financeiro-categorias', 'ativas'],
    queryFn: () => categoriasFinanceirasApi.listar({ pageSize: 100, ativo: 'true' }),
    staleTime: LONGO,
    select: (r) =>
      r.data
        .filter((c) => c.tipo === tipo)
        .map((c) => ({ id: c.id, nome: c.pai ? `${c.pai.nome} › ${c.nome}` : c.nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  })
}
