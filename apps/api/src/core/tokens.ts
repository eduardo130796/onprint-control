import { createHmac, randomBytes } from 'node:crypto'

/** Refresh token opaco (não é JWT): "{id da empresa}.{48 bytes aleatórios em base64url}". */
export function gerarRefreshToken(empresaId: string): string {
  return `${empresaId}.${randomBytes(48).toString('base64url')}`
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Empresa a que o refresh token pertence (a sessão fica no schema dela); cookie forjado ou corrompido → undefined. */
export function empresaDoRefreshToken(token: string): string | undefined {
  const [empresaId, aleatorio] = token.split('.')
  return aleatorio && empresaId && UUID.test(empresaId) ? empresaId : undefined
}

/** Só o hash (HMAC-SHA256 com JWT_REFRESH_SECRET) é gravado na tabela sessoes. */
export function hashRefreshToken(token: string, segredo: string): string {
  return createHmac('sha256', segredo).update(token).digest('hex')
}

/** Esconde tokens que viajam no caminho da URL (link de nova senha / convite). */
export function ocultarTokensDaUrl(url: string): string {
  return url.replace(/(\/auth\/redefinir-senha\/)[^/?#]+/g, '$1***')
}
