import type { DadosCnpj, EnderecoCep } from '@onprint/shared'
import { http } from './http'

/** Consulta de CEP e CNPJ — sempre pela nossa API (a CSP do site não deixa o navegador chamar serviços de fora). */
export const consultasApi = {
  cep: (cep: string, signal?: AbortSignal) => http<EnderecoCep>(`/consultas/cep/${cep}`, { signal }),
  cnpj: (cnpj: string, signal?: AbortSignal) => http<DadosCnpj>(`/consultas/cnpj/${cnpj}`, { signal }),
}
