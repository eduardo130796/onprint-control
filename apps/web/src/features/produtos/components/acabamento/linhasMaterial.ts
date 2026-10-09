import { paraApi } from '../../custos'

/** Linha da tela "O que este acabamento gasta" (valores como digitados). */
export interface MaterialAcabamentoLinha {
  chave: number
  insumoId: string
  nome: string
  unidade: string
  /** Custo por unidade de uso (decimal da API; '0' sem permissão) */
  custoUnitario: string
  quantidade: string
  perdaPercentual: string
}

let proxima = 1
export const novaLinhaMaterial = (): MaterialAcabamentoLinha => ({ chave: proxima++, insumoId: '', nome: '', unidade: '', custoUnitario: '0', quantidade: '1', perdaPercentual: '' })

/** Linhas da tela → `acabamentoSchema.materiais` (as sem insumo ficam de fora). */
export function materiaisParaApi(linhas: MaterialAcabamentoLinha[]) {
  return linhas.filter((l) => l.insumoId).map((l) => ({ insumoId: l.insumoId, quantidade: paraApi(l.quantidade), perdaPercentual: paraApi(l.perdaPercentual) || '0' }))
}
