import { Readable } from 'node:stream'
import sharp from 'sharp'
import type { StorageService } from '../../core/storage'

const TIPOS_COM_MINIATURA = new Set(['image/png', 'image/jpeg', 'image/tiff'])

/**
 * Acima disso não gera miniatura (~70 megapixels, ex.: 10.000 × 7.000): protege contra
 * "bomba de descompressão" (arquivo pequeno que vira gigabytes de pixels na memória).
 */
export const LIMITE_PIXELS_MINIATURA = 70_000_000

// Uma imagem por vez: miniatura é tarefa de fundo e não deve disputar CPU/memória com a API
sharp.concurrency(1)
let fila: Promise<unknown> = Promise.resolve()
/** Fila única de processamento de imagens (também usada pelas imagens da vitrine). */
export function emFila<T>(tarefa: () => Promise<T>): Promise<T> {
  const resultado = fila.then(tarefa, tarefa)
  fila = resultado.catch(() => undefined)
  return resultado
}

export async function lerTudo(storage: StorageService, caminho: string) {
  // O tamanho já é limitado pelo upload (UPLOAD_MAX_MB); o perigo está nos pixels, conferidos antes de decodificar
  const partes: Buffer[] = []
  for await (const parte of storage.abrir(caminho)) partes.push(parte as Buffer)
  return Buffer.concat(partes)
}

/**
 * Miniatura JPEG (até 480 px) das artes em imagem. PDF, AI, CDR e similares ficam sem miniatura
 * (o card mostra o ícone do arquivo). Falhas aqui nunca impedem o envio da arte.
 */
export async function gerarMiniatura(storage: StorageService, caminho: string, mime: string, nomeOriginal: string) {
  if (!TIPOS_COM_MINIATURA.has(mime)) return null
  try {
    const imagem = await emFila(async () => {
      const original = await lerTudo(storage, caminho)
      const opcoes = { limitInputPixels: LIMITE_PIXELS_MINIATURA, failOn: 'error' as const }
      // Só o cabeçalho: largura × altura sem decodificar a imagem
      const { width = 0, height = 0 } = await sharp(original, opcoes).metadata()
      if (!width || !height || width * height > LIMITE_PIXELS_MINIATURA) return null
      return sharp(original, opcoes)
        .rotate()
        .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 80 })
        .toBuffer()
    })
    if (!imagem) return null
    const nome = `miniatura-${nomeOriginal.replace(/\.[^.]+$/, '')}.jpg`
    const salvo = await storage.salvar(Readable.from(imagem), { categoria: 'arte', nomeOriginal: nome })
    return { ...salvo, nome }
  } catch {
    return null
  }
}
