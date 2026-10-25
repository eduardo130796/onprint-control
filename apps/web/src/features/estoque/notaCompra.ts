import { Decimal, normalizarDecimal, type ItemNotaCompra, type NotaCompraLida } from '@onprint/shared'
import { decimalParaCampo, decimalParaInput } from '@/lib/mascaras'
import type { Embalagem } from './embalagem'
import { moedaParaCampo, type ParcelaCompra } from './pagamento'

/*
 * Nota de compra lida pelo Assistente (XML exato; foto/PDF pela IA) → a entrada de estoque já preenchida para
 * conferir. Funções puras: a página só chama.
 */

/** Dados da nota que ficam na linha (para mostrar "na nota: 2 RL × R$ 1.450,00" e lembrar o código) */
export type ItemDaNota = Pick<ItemNotaCompra, 'codigo' | 'descricao' | 'unidade' | 'quantidade' | 'valorUnitario' | 'custoUnitario' | 'comoAchou' | 'conferir'>

/** Unidade da nota que é embalagem (rolo, caixa, pacote…): a quantidade é de embalagens (a mesma lista da API) */
export const ehUnidadeDeEmbalagem = (u: string | null) => Boolean(u && /^(RL|ROL|ROLO|CX|CAIXA|PC|PCT|PACOTE|CH|CHAPA|GL|GALAO|FD|FARDO|BD|BALDE|LT|LATA|BB|BOBINA|RESMA|RS)$/i.test(u.trim()))

const dec = (v: string | null | undefined) => {
  const t = v?.trim() ? normalizarDecimal(v) : '0'
  return /^-?\d+(\.\d+)?$/.test(t) ? new Decimal(t) : new Decimal(0)
}

/**
 * Valores da linha a partir do item: em embalagens (a quantidade da nota é de rolos/caixas e o custo é por embalagem)
 * ou direto na unidade de uso. O custo é o da nota com o rateio de frete/impostos/descontos.
 */
export function valoresDoItem(item: Pick<ItemNotaCompra, 'quantidade' | 'custoUnitario' | 'emEmbalagem'>, emb: Embalagem | null) {
  const porEmbalagem = Boolean(item.emEmbalagem && emb)
  return porEmbalagem
    ? { porEmbalagem, embalagens: decimalParaCampo(item.quantidade, 3), precoEmbalagem: decimalParaInput(item.custoUnitario, 2), quantidade: '', custoUnitario: '' }
    : { porEmbalagem, embalagens: '', precoEmbalagem: '', quantidade: decimalParaCampo(item.quantidade, 3), custoUnitario: decimalParaCampo(item.custoUnitario, 4) }
}

/**
 * O mesmo insumo em duas linhas da nota (a API pede uma linha por produto): soma as quantidades e o custo vira a média
 * ponderada (4 casas). A ordem da primeira aparição fica.
 */
export function juntarIguais<T extends { produtoId: string | undefined; quantidade: string; custoUnitario: string }>(itens: T[]): T[] {
  const ordem: T[] = []
  const porId = new Map<string, { item: T; q: Decimal; valor: Decimal }>()
  for (const i of itens) {
    if (!i.produtoId) {
      ordem.push(i)
      continue
    }
    const atual = porId.get(i.produtoId)
    const q = dec(i.quantidade)
    const valor = q.mul(dec(i.custoUnitario))
    if (!atual) {
      const novo = { item: { ...i }, q, valor }
      porId.set(i.produtoId, novo)
      ordem.push(novo.item)
    } else {
      atual.q = atual.q.plus(q)
      atual.valor = atual.valor.plus(valor)
      atual.item.quantidade = atual.q.toString()
      atual.item.custoUnitario = atual.q.gt(0) ? atual.valor.div(atual.q).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toString() : '0'
    }
  }
  return ordem
}

/** Parcelas das duplicatas no formato da tela */
export function parcelasDaNota(nota: Pick<NotaCompraLida, 'parcelas'>): ParcelaCompra[] {
  return nota.parcelas.map((p) => ({ vencimento: p.vencimento, valor: moedaParaCampo(p.valor) }))
}

/**
 * Centavos de arredondamento (custo em 4 casas, embalagens): a última parcela fecha com o total da entrada. Diferença
 * maior que R$ 1,00 não é arredondamento: fica para a pessoa ver o aviso e decidir.
 */
export function fecharParcelas(parcelas: ParcelaCompra[], total: string): ParcelaCompra[] {
  if (!parcelas.length) return parcelas
  const soma = parcelas.reduce((s, p) => s.plus(dec(p.valor)), new Decimal(0))
  const diferenca = dec(total).minus(soma)
  if (diferenca.isZero() || diferenca.abs().gt(1)) return parcelas
  const ultima = parcelas[parcelas.length - 1]!
  return [...parcelas.slice(0, -1), { ...ultima, valor: moedaParaCampo(dec(ultima.valor).plus(diferenca).toFixed(2)) }]
}

/** "LONA FRONT 440G BRANCA" → "Lona front 440G branca" (nome do insumo novo) */
export function nomeDoInsumo(descricao: string): string {
  const t = descricao.replace(/\s+/g, ' ').trim()
  if (t !== t.toUpperCase()) return t.slice(0, 160)
  const minusculo = t.toLowerCase().replace(/\b(\d+[a-z]*)\b/g, (m) => m.toUpperCase())
  return (minusculo.charAt(0).toUpperCase() + minusculo.slice(1)).slice(0, 160)
}

/** Unidade de uso do insumo novo pela unidade da nota ("KG" → kg, "L" → l); embalagem ou desconhecida: un */
export function unidadeDoInsumoNovo(unidadeNota: string | null, unidades: { id: string; sigla: string }[]): string | undefined {
  const u = (unidadeNota ?? '').trim().toLowerCase()
  const equivalentes: Record<string, string> = { lt: 'l', litro: 'l', kgs: 'kg', m2: 'm²', mt: 'm', mts: 'm', pc: 'un', pç: 'un', und: 'un', unid: 'un', fls: 'fl', folha: 'fl' }
  const alvo = equivalentes[u] ?? u
  return (unidades.find((x) => x.sigla.toLowerCase() === alvo) ?? unidades.find((x) => x.sigla === 'un'))?.id
}
