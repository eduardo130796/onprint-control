import { fatorEmbalagem, type InsumoDetalhe, type TipoEmbalagem } from '@onprint/shared'
import { insumosApi } from '@/api/custos'
import { converterEmbalagem, usoDaUnidade } from '@/features/produtos/custos'

/** Insumo comprado em embalagem (rolo, pacote…): a entrada pode ser lançada em embalagens. */
export interface Embalagem {
  tipo: TipoEmbalagem
  /** Unidades de uso em cada embalagem */
  fator: number
  sigla: string
  precoEmbalagem: string | null
}

/** Embalagem do insumo (null se é comprado por unidade ou se não dá para converter). */
export function embalagemDoInsumo(i: Pick<InsumoDetalhe, 'embalagem' | 'embalagemLargura' | 'embalagemComprimento' | 'embalagemConteudo' | 'precoEmbalagem' | 'unidadeMedida'>): Embalagem | null {
  if (i.embalagem === 'unidade') return null
  const sigla = i.unidadeMedida?.sigla ?? 'un'
  const fator = fatorEmbalagem({ embalagem: i.embalagem, largura: i.embalagemLargura, comprimento: i.embalagemComprimento, conteudo: i.embalagemConteudo }, usoDaUnidade(sigla))
  return fator > 0 ? { tipo: i.embalagem, fator, sigla, precoEmbalagem: i.precoEmbalagem ?? null } : null
}

/** Busca o insumo e a embalagem; null se o item não é insumo (ex.: produto de revenda). */
export async function buscarEmbalagem(id: string): Promise<{ insumo: InsumoDetalhe; embalagem: Embalagem | null } | null> {
  try {
    const insumo = await insumosApi.obter(id)
    return { insumo, embalagem: embalagemDoInsumo(insumo) }
  } catch {
    return null
  }
}

/** Quantidade e custo na unidade de uso (o que vai para a API), a partir da linha da entrada. */
export function valoresDaLinha(l: { porEmbalagem: boolean; embalagem: Embalagem | null; embalagens: string; precoEmbalagem: string; quantidade: string; custoUnitario: string }): { quantidade: string; custoUnitario: string } {
  if (l.porEmbalagem && l.embalagem) {
    const c = converterEmbalagem(l.embalagens, l.precoEmbalagem, l.embalagem.fator)
    if (c) return { quantidade: l.embalagens.trim() ? c.quantidade : '', custoUnitario: l.precoEmbalagem.trim() ? c.custoUnitario : '' }
  }
  return { quantidade: l.quantidade, custoUnitario: l.custoUnitario }
}
