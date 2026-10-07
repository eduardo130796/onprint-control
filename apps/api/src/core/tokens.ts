import { createHmac, randomBytes } from 'node:crypto'

/** Refresh token opaco (não é JWT): "{id da empresa}.{48 bytes aleatórios em base64url}". */
export function gerarRefreshToken(empresaId: string): string {
  return `${empresaId}.${randomBytes(48).toString('base64url')}`
}

/** Empresa a que o refresh token pertence (a sessão fica no schema dela). */
export function empresaDoRefreshToken(token: string): string | undefined {
  const [empresaId, aleatorio] = token.split('.')
  return aleatorio ? empresaId : undefined
}

/** Só o hash (HMAC-SHA256 com JWT_REFRESH_SECRET) é gravado na tabela sessoes. */
export function hashRefreshToken(token: string, segredo: string): string {
  return createHmac('sha256', segredo).update(token).digest('hex')
}
