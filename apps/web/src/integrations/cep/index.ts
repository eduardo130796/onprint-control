import { somenteDigitos, type EnderecoCep } from '@onprint/shared'
import { ErroApi } from '@/api/http'
import { consultasApi } from '@/api/consultas'

export type { EnderecoCep }

/** Busca de endereço por CEP. null = CEP não existe; outros problemas viram exceção (ErroApi). */
export interface CepProvider {
  buscar(cep: string, signal?: AbortSignal): Promise<EnderecoCep | null>
}

/** Pergunta à nossa API, que consulta BrasilAPI/ViaCEP com cache. */
export class ApiCepProvider implements CepProvider {
  async buscar(cep: string, signal?: AbortSignal): Promise<EnderecoCep | null> {
    const d = somenteDigitos(cep)
    if (d.length !== 8) return null
    try {
      return await consultasApi.cep(d, signal)
    } catch (e) {
      if (e instanceof ErroApi && (e.status === 404 || e.status === 400)) return null
      throw e
    }
  }
}

export const cepProvider: CepProvider = new ApiCepProvider()
