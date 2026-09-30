/**
 * Ponto de extensão para busca de endereço por CEP.
 * Hoje: ManualCepProvider (não consulta nada; o usuário preenche o endereço).
 * Futuro (Fase 9): ViaCepProvider implementando a mesma interface.
 */
export interface EnderecoCep {
  cep: string
  logradouro: string
  bairro: string
  cidade: string
  uf: string
}

export interface CepProvider {
  readonly automatico: boolean
  buscar(cep: string): Promise<EnderecoCep | null>
}

export class ManualCepProvider implements CepProvider {
  readonly automatico = false

  async buscar(): Promise<EnderecoCep | null> {
    return null
  }
}

export const cepProvider: CepProvider = new ManualCepProvider()
