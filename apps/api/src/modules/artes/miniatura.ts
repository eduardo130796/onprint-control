import { Readable } from 'node:stream'
import sharp from 'sharp'
import type { StorageService } from '../../core/storage'

const TIPOS_COM_MINIATURA = new Set(['image/png', 'image/jpeg', 'image/tiff'])

/**
 * Miniatura JPEG (até 480 px) das artes em imagem. PDF, AI, CDR e similares ficam sem miniatura
 * (o card mostra o ícone do arquivo). Falhas aqui nunca impedem o envio da arte.
 */
export async function gerarMiniatura(storage: StorageService, caminho: string, mime: string, nomeOriginal: string) {
  if (!TIPOS_COM_MINIATURA.has(mime)) return null
  try {
    const partes: Buffer[] = []
    for await (const parte of storage.abrir(caminho)) partes.push(parte as Buffer)
    const imagem = await sharp(Buffer.concat(partes), { limitInputPixels: 400_000_000 })
      .rotate()
      .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 80 })
      .toBuffer()
    const nome = `miniatura-${nomeOriginal.replace(/\.[^.]+$/, '')}.jpg`
    const salvo = await storage.salvar(Readable.from(imagem), { categoria: 'arte', nomeOriginal: nome })
    return { ...salvo, nome }
  } catch {
    return null
  }
}
