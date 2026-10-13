import { formatarMoeda, somenteDigitos, type PrecoVitrine } from '@onprint/shared'

/** Partes do preço exibido, para montar com pesos diferentes ("A partir de" pequeno, valor grande, "/ m²" discreto) */
export interface PartesPreco {
  prefixo: string | null
  valor: string
  sufixo: string | null
}

/** "R$ 45,00 / m²", "A partir de R$ 45,00 / m²" ou "Sob consulta" (sem valor também é sob consulta) */
export function partesPreco(preco: PrecoVitrine): PartesPreco {
  const numero = preco.valor === null ? NaN : Number(preco.valor)
  if (preco.modo === 'sob_consulta' || !Number.isFinite(numero) || numero <= 0) {
    return { prefixo: null, valor: 'Sob consulta', sufixo: null }
  }
  return {
    prefixo: preco.modo === 'a_partir_de' ? 'A partir de' : null,
    valor: formatarMoeda(numero),
    sufixo: preco.unidade ? `/ ${preco.unidade}` : null,
  }
}

export function textoPreco(preco: PrecoVitrine): string {
  const p = partesPreco(preco)
  return [p.prefixo, p.valor, p.sufixo].filter(Boolean).join(' ')
}

/** Prazo de produção em dias (0 = não informado) */
export function textoPrazo(dias: number): string | null {
  if (!Number.isFinite(dias) || dias <= 0) return null
  return dias === 1 ? 'Pronto em 1 dia' : `Pronto em até ${dias} dias`
}

/** Texto de venda: parágrafos separados por linha em branco (quebra simples continua no mesmo parágrafo) */
export function paragrafos(texto: string | null | undefined): string[] {
  return (texto ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * Medida digitada (metros, com vírgula ou ponto) → decimal da API ("1.5"); vazio → null; inválida → undefined.
 * Aceita até 3 casas ("0,125").
 */
export function lerMedida(texto: string): string | null | undefined {
  const t = texto.trim().replace(/\s|m$/gi, '')
  if (!t) return null
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  if (!/^\d{1,5}(\.\d{1,3})?$/.test(normal) || Number(normal) <= 0) return undefined
  return String(Number(normal))
}

/** Decimal da API → texto do campo ("1.5" → "1,5") */
export function medidaParaCampo(valor: string | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return ''
  const n = Number(valor)
  return Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 3, useGrouping: false }) : ''
}

/** "1,5 m" */
export function formatarMetros(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return ''
  return `${Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} m`
}

/** "2 un. · 1,5 × 0,8 m · Ilhós, Bainha": resumo das escolhas de um item (lista, barra do produto, WhatsApp) */
export function resumoEscolha(e: {
  modoCalculo: string
  quantidade: number
  largura?: string | number | null
  altura?: string | number | null
  acabamentos?: string[]
}): string {
  const qtd = `${e.quantidade.toLocaleString('pt-BR')} ${e.modoCalculo === 'hora' ? 'h' : 'un.'}`
  const n = (v: string | number) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
  let medidas: string | null = null
  if ((e.modoCalculo === 'm2' || e.modoCalculo === 'metro_linear') && e.largura) {
    medidas = e.altura ? `${n(e.largura)} × ${n(e.altura)} m` : `${n(e.largura)} m`
  }
  const acabamentos = e.acabamentos?.length ? e.acabamentos.join(', ') : null
  return [qtd, medidas, acabamentos].filter(Boolean).join(' · ')
}

/** Miniatura (480 px) de uma imagem pública grande (1200 px), para as fotos pequenas da galeria */
export function miniatura(url: string): string {
  return url.replace(/([?&]w=)1200(?!\d)/, (_, antes: string) => `${antes}480`)
}

/** Link do WhatsApp (wa.me) com a mensagem pronta; números brasileiros ganham o 55 */
export function linkWhatsapp(numero: string | null | undefined, mensagem?: string | null): string | null {
  let d = somenteDigitos(numero ?? '')
  if (d.length < 10) return null
  if (d.length <= 11) d = `55${d}`
  const texto = mensagem?.trim()
  return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`
}

/** Rede social: aceita @usuario ou o endereço completo */
export function linkRede(rede: 'instagram' | 'facebook' | 'tiktok' | 'youtube', valor: string | null | undefined): string | null {
  const v = valor?.trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  if (/^(www\.)?[a-z0-9-]+\.[a-z]{2,}/i.test(v) && v.includes('/')) return `https://${v}`
  const usuario = v.replace(/^@/, '')
  const bases = {
    instagram: 'https://instagram.com/',
    facebook: 'https://facebook.com/',
    tiktok: 'https://tiktok.com/@',
    youtube: 'https://youtube.com/@',
  }
  return bases[rede] + encodeURIComponent(usuario)
}
