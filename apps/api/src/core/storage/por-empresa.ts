import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { contextoEmpresa } from '../contexto-empresa'
import { DiscoLocalStorage } from './disco-local'
import type { StorageService } from './index'

/** Separa empresa e arquivo dentro do id assinado do link temporário. */
const SEPARADOR = '~'

/**
 * Uma pasta por empresa ({raiz}/empresas/{id da empresa}/...). O link temporário leva o id
 * da empresa dentro da parte assinada, então não dá para trocar a empresa no link.
 */
export class StoragePorEmpresa implements StorageService {
  private readonly discos = new Map<string, DiscoLocalStorage>()
  private readonly assinador: DiscoLocalStorage

  constructor(
    private readonly raiz: string,
    private readonly segredo: string,
    private readonly urlBase: string,
  ) {
    this.assinador = new DiscoLocalStorage(raiz, segredo, urlBase)
  }

  /** Pasta da empresa de um id (também usada para mover os arquivos da empresa legada). */
  static pastaDaEmpresa(raiz: string, empresaId: string): string {
    return join(raiz, 'empresas', empresaId)
  }

  private disco(): DiscoLocalStorage {
    const { id } = contextoEmpresa.exigir()
    let disco = this.discos.get(id)
    if (!disco) {
      disco = new DiscoLocalStorage(StoragePorEmpresa.pastaDaEmpresa(this.raiz, id), this.segredo, this.urlBase)
      this.discos.set(id, disco)
    }
    return disco
  }

  salvar(conteudo: Readable, opcoes: { categoria: string; nomeOriginal: string }) {
    return this.disco().salvar(conteudo, opcoes)
  }

  abrir(caminho: string): Readable {
    return this.disco().abrir(caminho)
  }

  remover(caminho: string) {
    return this.disco().remover(caminho)
  }

  lerDerivado(caminho: string, sufixo: string) {
    return this.disco().lerDerivado(caminho, sufixo)
  }

  gravarDerivado(caminho: string, sufixo: string, dados: Buffer) {
    return this.disco().gravarDerivado(caminho, sufixo, dados)
  }

  gerarUrlTemporaria(arquivoId: string, validadeSegundos?: number): string {
    return this.assinador.gerarUrlTemporaria(`${contextoEmpresa.exigir().id}${SEPARADOR}${arquivoId}`, validadeSegundos)
  }

  validarTokenTemporario(token: string) {
    const [empresaId, arquivoId] = this.assinador.validarTokenTemporario(token)?.split(SEPARADOR) ?? []
    return empresaId && arquivoId ? { empresaId, arquivoId } : null
  }
}
