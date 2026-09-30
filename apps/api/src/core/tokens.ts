import { createHmac, randomBytes } from 'node:crypto'

/** Refresh token opaco (não é JWT): 48 bytes aleatórios em base64url. */
export function gerarRefreshToken(): string {
  return randomBytes(48).toString('base64url')
}

/** Só o hash (HMAC-SHA256 com JWT_REFRESH_SECRET) é gravado na tabela sessoes. */
export function hashRefreshToken(token: string, segredo: string): string {
  return createHmac('sha256', segredo).update(token).digest('hex')
}
