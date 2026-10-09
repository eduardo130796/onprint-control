import type { Readable } from 'node:stream'

/** Quantos bytes do início do arquivo bastam para conferir a assinatura ("magic bytes"). */
export const BYTES_ASSINATURA = 512

const PDF = Buffer.from('%PDF')
const POSTSCRIPT = Buffer.from('%!PS')
const EPS_BINARIO = Buffer.from([0xc5, 0xd0, 0xd3, 0xc6])
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG = Buffer.from([0xff, 0xd8, 0xff])
const TIFF_II = Buffer.from([0x49, 0x49, 0x2a, 0x00])
const TIFF_MM = Buffer.from([0x4d, 0x4d, 0x00, 0x2a])
const BIGTIFF_II = Buffer.from([0x49, 0x49, 0x2b, 0x00])
const BIGTIFF_MM = Buffer.from([0x4d, 0x4d, 0x00, 0x2b])
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04])
const ZIP_VAZIO = Buffer.from([0x50, 0x4b, 0x05, 0x06])
const PSD = Buffer.from('8BPS')
const RIFF = Buffer.from('RIFF')

const comeca = (bytes: Buffer, assinatura: Buffer) => bytes.subarray(0, assinatura.length).equals(assinatura)

/** SVG é texto: depois de BOM e espaços, precisa abrir com <svg, <?xml ou <!DOCTYPE svg. */
function ehSvg(bytes: Buffer) {
  const texto = bytes.toString('utf8').replace(/^\uFEFF/, '').trimStart().toLowerCase()
  return texto.startsWith('<svg') || texto.startsWith('<?xml') || texto.startsWith('<!doctype svg')
}

/** Assinaturas aceitas por extensão (ver EXTENSOES_PERMITIDAS no shared). */
const VERIFICADORES: Record<string, (bytes: Buffer) => boolean> = {
  pdf: (b) => comeca(b, PDF),
  png: (b) => comeca(b, PNG),
  jpg: (b) => comeca(b, JPEG),
  jpeg: (b) => comeca(b, JPEG),
  tif: (b) => [TIFF_II, TIFF_MM, BIGTIFF_II, BIGTIFF_MM].some((a) => comeca(b, a)),
  tiff: (b) => [TIFF_II, TIFF_MM, BIGTIFF_II, BIGTIFF_MM].some((a) => comeca(b, a)),
  zip: (b) => comeca(b, ZIP) || comeca(b, ZIP_VAZIO),
  psd: (b) => comeca(b, PSD),
  // Illustrator moderno é PDF por dentro; os antigos e o EPS são PostScript (EPS também tem a versão binária do DOS)
  ai: (b) => comeca(b, PDF) || comeca(b, POSTSCRIPT),
  eps: (b) => comeca(b, POSTSCRIPT) || comeca(b, EPS_BINARIO),
  // CorelDRAW até o X3 é RIFF; do X4 em diante é um ZIP
  cdr: (b) => comeca(b, RIFF) || comeca(b, ZIP),
  svg: ehSvg,
}

/**
 * Confere o início do arquivo com a extensão declarada.
 * true/false para tipos conhecidos; null quando não há verificação para a extensão.
 */
export function conteudoConfere(extensao: string, inicio: Buffer): boolean | null {
  const verificar = VERIFICADORES[extensao.toLowerCase()]
  return verificar ? verificar(inicio) : null
}

/** Lê só o começo de um stream (e o fecha). */
export async function lerInicio(stream: Readable, bytes = BYTES_ASSINATURA): Promise<Buffer> {
  const partes: Buffer[] = []
  let total = 0
  try {
    for await (const parte of stream) {
      const buf = parte as Buffer
      partes.push(buf)
      total += buf.length
      if (total >= bytes) break
    }
  } finally {
    stream.destroy()
  }
  return Buffer.concat(partes).subarray(0, bytes)
}
