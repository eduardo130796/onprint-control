import type {
  Arquivo,
  Cliente,
  ClienteDetalhe,
  ClientesQuery,
  Contato,
  Endereco,
  Fornecedor,
  FornecedoresQuery,
  OpcaoSelect,
  Paginado,
} from '@onprint/shared'
import { http, qs, upload } from './http'

/** Clientes, fornecedores e anexos. Corpos já validados pelos schemas compartilhados no formulário. */
export const clientesApi = {
  listar: (q: ClientesQuery) => http<Paginado<Cliente>>(`/clientes${qs(q)}`),
  obter: (id: string) => http<ClienteDetalhe>(`/clientes/${id}`),
  criar: (dados: unknown) => http<Cliente>('/clientes', { method: 'POST', body: dados }),
  atualizar: (id: string, dados: unknown) => http<Cliente>(`/clientes/${id}`, { method: 'PUT', body: dados }),
  desativar: (id: string) => http<Cliente>(`/clientes/${id}`, { method: 'DELETE' }),
  reativar: (id: string) => http<Cliente>(`/clientes/${id}/reativar`, { method: 'POST' }),

  salvarEndereco: (clienteId: string, dados: unknown, id?: string) =>
    id
      ? http<Endereco>(`/clientes/${clienteId}/enderecos/${id}`, { method: 'PUT', body: dados })
      : http<Endereco>(`/clientes/${clienteId}/enderecos`, { method: 'POST', body: dados }),
  removerEndereco: (clienteId: string, id: string) =>
    http<void>(`/clientes/${clienteId}/enderecos/${id}`, { method: 'DELETE' }),

  salvarContato: (clienteId: string, dados: unknown, id?: string) =>
    id
      ? http<Contato>(`/clientes/${clienteId}/contatos/${id}`, { method: 'PUT', body: dados })
      : http<Contato>(`/clientes/${clienteId}/contatos`, { method: 'POST', body: dados }),
  removerContato: (clienteId: string, id: string) =>
    http<void>(`/clientes/${clienteId}/contatos/${id}`, { method: 'DELETE' }),
}

export const fornecedoresApi = {
  listar: (q: FornecedoresQuery) => http<Paginado<Fornecedor>>(`/fornecedores${qs(q)}`),
  obter: (id: string) => http<Fornecedor>(`/fornecedores/${id}`),
  criar: (dados: unknown) => http<Fornecedor>('/fornecedores', { method: 'POST', body: dados }),
  atualizar: (id: string, dados: unknown) => http<Fornecedor>(`/fornecedores/${id}`, { method: 'PUT', body: dados }),
  desativar: (id: string) => http<Fornecedor>(`/fornecedores/${id}`, { method: 'DELETE' }),
  reativar: (id: string) => http<Fornecedor>(`/fornecedores/${id}/reativar`, { method: 'POST' }),
}

export type EntidadeAnexo = 'cliente' | 'fornecedor' | 'pedido'

export const arquivosApi = {
  listar: (entidade: EntidadeAnexo, entidadeId: string) => http<Arquivo[]>(`/arquivos${qs({ entidade, entidadeId })}`),
  enviar: (entidade: EntidadeAnexo, entidadeId: string, arquivo: File, aoProgredir?: (pct: number) => void) =>
    upload<Arquivo>(`/arquivos${qs({ entidade, entidadeId, categoria: 'anexo' })}`, arquivo, aoProgredir),
  urlTemporaria: (id: string) => http<{ url: string }>(`/arquivos/${id}/url`),
  remover: (id: string) => http<void>(`/arquivos/${id}`, { method: 'DELETE' }),
}

export const usuariosOpcoesApi = {
  /** Usuários ativos (id, nome) — disponível a qualquer usuário logado. */
  opcoes: () => http<OpcaoSelect[]>('/usuarios/opcoes'),
}
