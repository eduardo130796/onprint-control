import { formatarTelefone } from '@onprint/shared'
import { clientesApi } from '@/api/cadastros'
import { orcamentosApi } from '@/api/comercial'
import type { OpcaoBusca } from '@/components/shared/SearchSelect'
import { formatarPrecoUnitario } from '@/lib/produtos'
import type { ModoCalculo } from '@onprint/shared'

/** Clientes ativos para os campos de busca do comercial. */
export async function buscarClientes(termo: string): Promise<OpcaoBusca[]> {
  const r = await clientesApi.listar({ busca: termo || undefined, pageSize: 10, ativo: 'true' })
  return r.data.map((c) => ({
    id: c.id,
    rotulo: c.nome,
    detalhe: [c.situacao === 'pre_cadastro' ? 'pré-cadastro' : null, formatarTelefone(c.whatsapp ?? c.telefone)].filter(Boolean).join(' · '),
  }))
}

/** Produtos do catálogo de orçamento. */
export async function buscarProdutos(termo: string): Promise<OpcaoBusca[]> {
  const produtos = await orcamentosApi.catalogo(termo)
  return produtos.map((p) => ({
    id: p.id,
    rotulo: p.nome,
    detalhe: `${p.codigo} · ${formatarPrecoUnitario(p.precoVenda, p.modoCalculo as ModoCalculo)}`,
  }))
}
