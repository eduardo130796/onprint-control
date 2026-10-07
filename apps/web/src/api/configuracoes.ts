import type {
  EmpresaConfig,
  MatrizPermissoes,
  MensagemTemplate,
  Paginado,
  PapelResumo,
  StatusConfig,
  UsuarioResumo,
  UsuariosQuery,
} from '@onprint/shared'
import { http, qs, upload } from './http'

export const usuariosApi = {
  listar: (q: UsuariosQuery) => http<Paginado<UsuarioResumo>>(`/usuarios${qs(q)}`),
  papeis: () => http<PapelResumo[]>('/usuarios/papeis'),
  configuracao: () => http<{ emailConfigurado: boolean }>('/usuarios/configuracao'),
  criar: (dados: unknown) => http<UsuarioResumo & { conviteEnviado: boolean }>('/usuarios', { method: 'POST', body: dados }),
  enviarLinkSenha: (id: string) => http<void>(`/usuarios/${id}/link-senha`, { method: 'POST' }),
  atualizar: (id: string, dados: unknown) => http<UsuarioResumo>(`/usuarios/${id}`, { method: 'PUT', body: dados }),
  redefinirSenha: (id: string, senhaProvisoria: string) =>
    http<void>(`/usuarios/${id}/redefinir-senha`, { method: 'POST', body: { senhaProvisoria } }),
  desativar: (id: string) => http<UsuarioResumo>(`/usuarios/${id}`, { method: 'DELETE' }),
}

export const permissoesApi = {
  matriz: () => http<MatrizPermissoes>('/permissoes'),
  salvar: (papelId: string, permissoes: string[]) =>
    http<{ papelId: string; permissoes: string[] }>(`/permissoes/papeis/${papelId}`, {
      method: 'PUT',
      body: { permissoes },
    }),
}

export const empresaApi = {
  obter: () => http<EmpresaConfig>('/empresa'),
  salvar: (dados: unknown) => http<EmpresaConfig>('/empresa', { method: 'PUT', body: dados }),
  enviarLogo: (arquivo: File, aoProgredir?: (pct: number) => void) =>
    upload<EmpresaConfig>('/empresa/logo', arquivo, aoProgredir),
}

export const statusApi = {
  listar: () => http<StatusConfig[]>('/status'),
  salvar: (id: string, dados: { rotulo: string; cor: string; ordem: number; ativo?: boolean }) =>
    http<StatusConfig>(`/status/${id}`, { method: 'PUT', body: dados }),
  /** Status próprio: conta como `base` (um status do sistema da mesma entidade) */
  criar: (dados: { entidade: string; rotulo: string; cor: string; base: string; ordem?: number }) => http<StatusConfig>('/status', { method: 'POST', body: dados }),
  remover: (id: string) => http<void>(`/status/${id}`, { method: 'DELETE' }),
}

export const templatesApi = {
  listar: () => http<MensagemTemplate[]>('/templates'),
  criar: (dados: unknown) => http<MensagemTemplate>('/templates', { method: 'POST', body: dados }),
  atualizar: (id: string, dados: unknown) => http<MensagemTemplate>(`/templates/${id}`, { method: 'PUT', body: dados }),
  remover: (id: string) => http<void>(`/templates/${id}`, { method: 'DELETE' }),
}
