import type { FastifyReply } from 'fastify'
import sharp from 'sharp'
import { AppError } from '../../core/AppError'
import { API_PREFIX } from '../../core/constantes'
import type { StorageService } from '../../core/storage'
import { emFila, lerTudo, LIMITE_PIXELS_MINIATURA } from '../artes/miniatura'

/** Larguras servidas: 480 (cards e miniaturas) e 1200 (banner e página do produto) */
export const LARGURAS_IMAGEM = ['480', '1200'] as const
export type LarguraImagem = (typeof LARGURAS_IMAGEM)[number]

/** Imagens aceitas na galeria e no banner (o conteúdo é conferido pelos bytes no upload) */
export const EXTENSOES_FOTO = ['png', 'jpg', 'jpeg'] as const

/** Imagem pública da vitrine: /publico/{slug}/vitrine/imagens/{arquivo}?w=480 */
export const urlImagemPublica = (slug: string, arquivoId: string, w: LarguraImagem) => `${API_PREFIX}/publico/${slug}/vitrine/imagens/${arquivoId}?w=${w}`

/**
 * Miniatura para a área logada (produto ainda não publicado, vitrine desligada): link assinado
 * e com validade, como os demais arquivos (/vitrine/miniaturas/{token}).
 */
export function urlMiniaturaLogada(storage: StorageService, arquivoId: string, validadeSegundos = 6 * 3600) {
  const token = storage.gerarUrlTemporaria(arquivoId, validadeSegundos).split('/').pop() as string
  return `${API_PREFIX}/vitrine/miniaturas/${token}?w=480`
}

/** Redimensiona para WebP (sem aumentar), uma imagem por vez na fila do sharp. */
async function gerarWebp(storage: StorageService, caminho: string, largura: number) {
  return emFila(async () => {
    const original = await lerTudo(storage, caminho)
    const opcoes = { limitInputPixels: LIMITE_PIXELS_MINIATURA, failOn: 'error' as const }
    const { width = 0, height = 0 } = await sharp(original, opcoes).metadata()
    if (!width || !height || width * height > LIMITE_PIXELS_MINIATURA) return null
    return sharp(original, opcoes)
      .rotate()
      .resize(largura, largura, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
  }).catch(() => null)
}

/**
 * Responde a imagem redimensionada. A versão WebP fica guardada ao lado do original
 * ({arquivo}.w480.webp) e é apagada junto com ele.
 */
export async function enviarImagem(
  storage: StorageService,
  reply: FastifyReply,
  arquivo: { caminho: string },
  w: LarguraImagem,
  cache: 'public' | 'private',
) {
  const sufixo = `.w${w}.webp`
  let imagem = await storage.lerDerivado(arquivo.caminho, sufixo)
  if (!imagem) {
    imagem = await gerarWebp(storage, arquivo.caminho, Number(w))
    if (!imagem) throw AppError.naoEncontrado('Imagem não encontrada.')
    await storage.gravarDerivado(arquivo.caminho, sufixo, imagem).catch(() => undefined)
  }
  return reply
    .header('Content-Type', 'image/webp')
    .header('Cache-Control', cache === 'public' ? 'public, max-age=86400' : 'private, max-age=3600')
    .send(imagem)
}
