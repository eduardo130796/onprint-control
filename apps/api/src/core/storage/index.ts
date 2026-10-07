import type { Readable } from 'node:stream'

export interface ArquivoSalvo {
  caminho: string
  tamanho: number
}

/**
 * Armazenamento de arquivos da empresa do contexto. Implementação atual: StoragePorEmpresa
 * (uma pasta por empresa no volume "uploads", gravada com DiscoLocalStorage).
 * No futuro basta criar uma implementação S3 com esta mesma interface.
 */
export interface StorageService {
  salvar(conteudo: Readable, opcoes: { categoria: string; nomeOriginal: string }): Promise<ArquivoSalvo>
  abrir(caminho: string): Readable
  remover(caminho: string): Promise<void>
  /** URL assinada e com validade, para acesso sem login (ex.: arte no link público). */
  gerarUrlTemporaria(arquivoId: string, validadeSegundos?: number): string
  /** Valida o token de uma URL temporária e devolve a empresa e o arquivo (ou null). */
  validarTokenTemporario(token: string): { empresaId: string; arquivoId: string } | null
}

export { DiscoLocalStorage } from './disco-local'
export { StoragePorEmpresa } from './por-empresa'
