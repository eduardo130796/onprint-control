import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { dirname, join, normalize, sep } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ArquivoSalvo, StorageService } from './index'

/** Nome seguro para disco: sem acentos, espaços ou caracteres especiais. */
export function nomeSeguro(nome: string): string {
  const limpo = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+/, '')
  return (limpo || 'arquivo').slice(-120)
}

/** Grava em {raiz}/{categoria}/{ano}/{mes}/{uuid}-{nome}. */
export class DiscoLocalStorage implements StorageService {
  constructor(
    private readonly raiz: string,
    private readonly segredo: string,
    private readonly urlBase: string,
  ) {}

  private resolver(caminho: string): string {
    const completo = normalize(join(this.raiz, caminho))
    // Impede path traversal (../../etc/passwd)
    if (!completo.startsWith(normalize(this.raiz) + sep)) throw new Error('Caminho de arquivo inválido')
    return completo
  }

  async salvar(conteudo: Readable, { categoria, nomeOriginal }: { categoria: string; nomeOriginal: string }) {
    const agora = new Date()
    const mes = String(agora.getMonth() + 1).padStart(2, '0')
    const caminho = [categoria, agora.getFullYear(), mes, `${randomUUID()}-${nomeSeguro(nomeOriginal)}`].join('/')
    const destino = this.resolver(caminho)
    await mkdir(dirname(destino), { recursive: true })
    await pipeline(conteudo, createWriteStream(destino))
    const { size } = await stat(destino)
    return { caminho, tamanho: size } satisfies ArquivoSalvo
  }

  abrir(caminho: string): Readable {
    return createReadStream(this.resolver(caminho))
  }

  async remover(caminho: string) {
    await rm(this.resolver(caminho), { force: true })
  }

  private assinar(dados: string): string {
    return createHmac('sha256', this.segredo).update(dados).digest('base64url')
  }

  gerarUrlTemporaria(arquivoId: string, validadeSegundos = 600): string {
    const expira = Math.floor(Date.now() / 1000) + validadeSegundos
    const dados = `${arquivoId}.${expira}`
    return `${this.urlBase}/arquivos/publico/${dados}.${this.assinar(dados)}`
  }

  validarTokenTemporario(token: string): string | null {
    const partes = token.split('.')
    if (partes.length !== 3) return null
    const [id, expira, assinatura] = partes as [string, string, string]
    const esperada = Buffer.from(this.assinar(`${id}.${expira}`))
    const recebida = Buffer.from(assinatura)
    if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null
    if (Number(expira) < Date.now() / 1000) return null
    return id
  }
}
