/**
 * Endereço da vitrine: cada gráfica tem o site em `{slug}.{DOMINIO_VITRINE}` (ver docs/VITRINE.md, seção 1).
 * Este arquivo não importa nada do sistema: o main.tsx decide por ele qual app carregar.
 */

/** Subdomínios que nunca são vitrine (a criação de slug também os recusa) */
export const SUBDOMINIOS_RESERVADOS = [
  'www',
  'app',
  'api',
  'admin',
  'plataforma',
  'painel',
  'mail',
  'smtp',
  'ftp',
  'status',
  'blog',
  'ajuda',
  'suporte',
  'docs',
  'cdn',
  'static',
  'assets',
] as const

const RESERVADOS = new Set<string>(SUBDOMINIOS_RESERVADOS)
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Domínio base da vitrine: VITE_DOMINIO_VITRINE (ex.: grafygo.com.br); em desenvolvimento, localhost. */
export function dominioBaseVitrine(valor: string | undefined): string {
  const base = (valor ?? '').trim().toLowerCase().replace(/^\.+|\.+$/g, '')
  return base || 'localhost'
}

/**
 * Pode ser o domínio próprio de uma gráfica (www.suagrafica.com.br): não é localhost, IP, a base das vitrines nem
 * subdomínio dela. Só então o site pergunta à API de qual vitrine é (o sistema no endereço dele não paga essa consulta).
 */
export function pareceDominioProprio(host: string, base: string): boolean {
  const h = host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  const b = dominioBaseVitrine(base)
  if (!h.includes('.') || h === 'localhost' || h.endsWith('.localhost')) return false
  if (/^\d+(?:\.\d+){3}$/.test(h) || h.startsWith('[')) return false
  return h !== b && !h.endsWith(`.${b}`)
}

/**
 * Slug da gráfica quando o host é `{slug}.{base}` (um nível só, sem porta), ou null para o sistema.
 * Ex.: ("vitrine-cupom.localhost", "localhost") → "vitrine-cupom"; ("app.grafygo.com.br", …) → null.
 */
export function slugDaVitrine(host: string, base: string): string | null {
  const h = host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  const b = dominioBaseVitrine(base)
  if (!h.endsWith(`.${b}`)) return null
  const slug = h.slice(0, -(b.length + 1))
  if (!slug || slug.includes('.') || !SLUG.test(slug) || RESERVADOS.has(slug)) return null
  return slug
}
