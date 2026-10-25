import { clienteSchema, nomeCliente, type ClienteNovoSugerido, type DadosCnpj } from '@onprint/shared'
import { clientesApi } from '@/api/cadastros'
import { ErroApi } from '@/api/http'
import type { OpcaoBusca } from '@/components/shared/SearchSelect'

/** O cliente que o Assistente leu no pedido e ainda não está no orçamento: novo (cadastrar ao salvar) ou para escolher */
export interface ClientePendente {
  novo: (ClienteNovoSugerido & { endereco?: DadosCnpj['endereco'] | null }) | null
  candidatos: { id: string; rotulo: string; detalhe: string | null }[]
}

/** O cliente novo dá para cadastrar (nome e um contato: a mesma regra do cadastro) */
export function clienteNovoCompleto(n: ClienteNovoSugerido | null): boolean {
  return Boolean(n?.nome?.trim() && (n.whatsapp || n.telefone || n.email))
}

/**
 * Cadastra o cliente novo como pré-cadastro (junto com o orçamento, ao salvar). Já existe alguém com o mesmo CPF/CNPJ
 * ou WhatsApp (a API responde 409 com o cliente): usa esse — nunca cria duplicado.
 */
export async function cadastrarClienteNovo(n: NonNullable<ClientePendente['novo']>): Promise<OpcaoBusca> {
  const dados = clienteSchema.safeParse({
    tipoPessoa: n.documento?.length === 14 ? 'PJ' : n.documento?.length === 11 ? 'PF' : n.tipoPessoa,
    nome: n.nome?.trim() ?? '',
    cpfCnpj: n.documento ?? '',
    email: n.email ?? '',
    telefone: n.telefone ?? '',
    whatsapp: n.whatsapp ?? '',
    situacao: 'pre_cadastro',
  })
  if (!dados.success) throw new Error(`Cliente novo: ${dados.error.issues[0]?.message ?? 'confira os dados.'}`)
  try {
    const c = await clientesApi.criar(dados.data)
    // Endereço da Receita (CNPJ): melhor esforço, o cliente já está salvo
    const e = n.endereco
    if (e?.logradouro && e.cidade && e.uf) {
      await clientesApi
        .salvarEndereco(c.id, { tipo: 'principal', cep: e.cep, logradouro: e.logradouro, numero: e.numero, complemento: e.complemento, bairro: e.bairro, cidade: e.cidade, uf: e.uf, referencia: '' })
        .catch(() => undefined)
    }
    return { id: c.id, rotulo: nomeCliente(c) }
  } catch (erro) {
    const d = erro instanceof ErroApi && erro.status === 409 ? (erro.details as { clienteId?: string; nome?: string } | undefined) : undefined
    if (d?.clienteId) return { id: d.clienteId, rotulo: d.nome ?? n.nome ?? 'Cliente' }
    throw erro
  }
}
