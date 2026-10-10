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

/** Formatos servidos: WebP (site) e JPEG (prévia do link no WhatsApp e redes, que nem sempre leem WebP) */
export const FORMATOS_IMAGEM = ['webp', 'jpg'] as const
export type FormatoImagem = (typeof FORMATOS_IMAGEM)[number]

const TIPO_CONTEUDO: Record<FormatoImagem, string> = { webp: 'image/webp', jpg: 'image/jpeg' }

/** Redimensiona (sem aumentar) para WebP ou JPEG, uma imagem por vez na fila do sharp. */
async function gerarImagem(storage: StorageService, caminho: string, largura: number, formato: FormatoImagem) {
  return emFila(async () => {
    const original = await lerTudo(storage, caminho)
    const opcoes = { limitInputPixels: LIMITE_PIXELS_MINIATURA, failOn: 'error' as const }
    const { width = 0, height = 0 } = await sharp(original, opcoes).metadata()
    if (!width || !height || width * height > LIMITE_PIXELS_MINIATURA) return null
    const redimensionada = sharp(original, opcoes).rotate().resize(largura, largura, { fit: 'inside', withoutEnlargement: true })
    // JPEG não tem transparência: o fundo transparente (logo em PNG) vira branco
    return formato === 'jpg'
      ? redimensionada.flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
      : redimensionada.webp({ quality: 80 }).toBuffer()
  }).catch(() => null)
}

/**
 * Imagem redimensionada, guardada ao lado do original ({arquivo}.w480.webp, {arquivo}.w1200.jpg…) e apagada
 * junto com ele (SUFIXOS_DERIVADOS). null se o original não é uma imagem legível.
 */
export async function obterImagem(storage: StorageService, caminho: string, w: LarguraImagem, formato: FormatoImagem = 'webp') {
  const sufixo = `.w${w}.${formato}`
  const guardada = await storage.lerDerivado(caminho, sufixo)
  if (guardada) return guardada
  const imagem = await gerarImagem(storage, caminho, Number(w), formato)
  if (imagem) await storage.gravarDerivado(caminho, sufixo, imagem).catch(() => undefined)
  return imagem
}

/** Responde a imagem redimensionada (WebP por padrão; JPEG com f=jpg). */
export async function enviarImagem(
  storage: StorageService,
  reply: FastifyReply,
  arquivo: { caminho: string },
  w: LarguraImagem,
  cache: 'public' | 'private',
  formato: FormatoImagem = 'webp',
) {
  const imagem = await obterImagem(storage, arquivo.caminho, w, formato)
  if (!imagem) throw AppError.naoEncontrado('Imagem não encontrada.')
  return reply
    .header('Content-Type', TIPO_CONTEUDO[formato])
    .header('Cache-Control', cache === 'public' ? 'public, max-age=86400' : 'private, max-age=3600')
    .send(imagem)
}
