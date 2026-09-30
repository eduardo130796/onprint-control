import { estoqueApi } from '@/api/estoque'
import type { OpcaoBusca } from '@/components/shared/SearchSelect'
import { formatarQuantidade } from '@/lib/quantidade'

/** Produtos que controlam estoque, com o saldo atual no detalhe. */
export async function buscarProdutosEstoque(termo: string): Promise<OpcaoBusca[]> {
  const r = await estoqueApi.posicao({ busca: termo || undefined, pageSize: 15 })
  return r.data.map((l) => ({ id: l.produto.id, rotulo: l.produto.nome, detalhe: `${l.produto.codigo} · saldo ${formatarQuantidade(l.saldo, l.produto.unidade)}` }))
}

export async function buscarFornecedoresEstoque(termo: string): Promise<OpcaoBusca[]> {
  return (await estoqueApi.fornecedores(termo)).map((f) => ({ id: f.id, rotulo: f.nome }))
}
