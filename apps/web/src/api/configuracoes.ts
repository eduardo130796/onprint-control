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
  criar: (dados: unknown) => http<UsuarioResumo>('/usuarios', { method: 'POST', body: dados }),
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
  salvar: (id: string, dados: { rotulo: string; cor: string; ordem: number }) =>
    http<StatusConfig>(`/status/${id}`, { method: 'PUT', body: dados }),
}

export const templatesApi = {
  listar: () => http<MensagemTemplate[]>('/templates'),
  criar: (dados: unknown) => http<MensagemTemplate>('/templates', { method: 'POST', body: dados }),
  atualizar: (id: string, dados: unknown) => http<MensagemTemplate>(`/templates/${id}`, { method: 'PUT', body: dados }),
  remover: (id: string) => http<void>(`/templates/${id}`, { method: 'DELETE' }),
}
