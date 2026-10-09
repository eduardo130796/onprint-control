import type { OpcaoBusca } from '@/components/shared/SearchSelect'
import { insumosApi } from '@/api/custos'
import { produtosApi } from '@/api/produtos'
import { formatarCusto } from './custos'

/** O que a tela guarda do insumo escolhido (a busca só devolve id/rótulo/detalhe). */
export interface InfoInsumo {
  nome: string
  unidade: string
  /** Custo por unidade de uso ('0' quando não vem: sem custo ou sem permissão) */
  custo: string
}

/**
 * Busca de insumos com custo e unidade (composição do produto e "O que este acabamento gasta"). Guarda os
 * dados de cada opção em `cache` para preencher a linha ao escolher. Com `revendaExceto`, inclui produtos de
 * revenda (menos o próprio produto).
 */
export function criarBuscaInsumos(cache: Map<string, InfoInsumo>, opcoes: { revendaExceto?: string } = {}) {
  return async function buscar(termo: string): Promise<OpcaoBusca[]> {
    const busca = termo || undefined
    const [insumos, revenda] = await Promise.all([
      insumosApi.listar({ busca, pageSize: 20, page: 1 }),
      opcoes.revendaExceto !== undefined ? produtosApi.listar({ busca, pageSize: 5, page: 1, tipo: 'revenda', ativo: 'true' }) : Promise.resolve(null),
    ])
    const lista: OpcaoBusca[] = []
    for (const i of insumos.data) {
      const unidade = i.unidadeMedida?.sigla ?? 'un'
      cache.set(i.id, { nome: i.nome, unidade, custo: i.custo ?? '0' })
      lista.push({ id: i.id, rotulo: i.nome, detalhe: i.custo === undefined ? unidade : Number(i.custo) > 0 ? `${formatarCusto(i.custo)} / ${unidade}` : `Sem custo · ${unidade}` })
    }
    for (const p of (revenda?.data ?? []).filter((p) => p.id !== opcoes.revendaExceto)) {
      const unidade = p.unidadeMedida?.sigla ?? 'un'
      cache.set(p.id, { nome: p.nome, unidade, custo: p.custo ?? '0' })
      lista.push({ id: p.id, rotulo: p.nome, detalhe: `Revenda · ${formatarCusto(p.custo)} / ${unidade}` })
    }
    return lista
  }
}
