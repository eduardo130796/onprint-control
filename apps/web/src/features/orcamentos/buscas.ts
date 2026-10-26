import { formatarTelefone, nomeCliente } from '@onprint/shared'
import { clientesApi } from '@/api/cadastros'
import { whatsappApi } from '@/api/whatsapp'
import { orcamentosApi } from '@/api/comercial'
import type { OpcaoBusca } from '@/components/shared/SearchSelect'
import { formatarPrecoUnitario } from '@/lib/produtos'
import type { ModoCalculo } from '@onprint/shared'

/** Clientes ativos para os campos de busca do comercial. */
export async function buscarClientes(termo: string): Promise<OpcaoBusca[]> {
  const r = await clientesApi.listar({ busca: termo || undefined, pageSize: 10, ativo: 'true' })
  return r.data.map((c) => ({
    id: c.id,
    rotulo: nomeCliente(c),
    detalhe: [c.situacao === 'pre_cadastro' ? 'pré-cadastro' : null, formatarTelefone(c.whatsapp ?? c.telefone)].filter(Boolean).join(' · '),
  }))
}

/** Prefixo do id da opção que é um contato do WhatsApp (ainda não cliente): "whatsapp:5511988887777" */
export const CONTATO_WHATSAPP = 'whatsapp:'

/** DDD + número (como o cadastro guarda) do contato escolhido */
export const numeroDoContato = (id: string) => id.slice(CONTATO_WHATSAPP.length).replace(/^55(?=\d{10,11}$)/, '')

/**
 * Clientes e, com busca de 2+ letras, quem já escreveu no WhatsApp da gráfica e ainda não é cliente ("Carla · WhatsApp ·
 * novo"): escolher o contato preenche o pré-cadastro com o nome e o número, sem copiar nada.
 */
export async function buscarClientesEContatos(termo: string): Promise<OpcaoBusca[]> {
  const t = termo.trim()
  const [clientes, contatos] = await Promise.all([
    buscarClientes(termo),
    t.length >= 2 ? whatsappApi.contatos(t).catch(() => []) : Promise.resolve([]),
  ])
  const novos = contatos
    .filter((c) => !c.cliente && c.nome)
    .slice(0, 5)
    .map((c) => ({ id: `${CONTATO_WHATSAPP}${c.numero}`, rotulo: c.nome, detalhe: ['WhatsApp', formatarTelefone(c.numero.replace(/^55/, '')), 'novo'].filter(Boolean).join(' · ') }))
  return [...clientes, ...novos]
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
