import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

/*
 * Chave da API do provedor de IA guardada cifrada no banco (assistente_config.chave_cifrada): AES-256-GCM com uma
 * chave derivada por HKDF-SHA256 do IA_SEGREDO (opcional) ou, sem ele, do JWT_ACCESS_SECRET. Formato:
 * "v1:<iv>:<tag>:<cifrado>" (base64url). Trocar o segredo de origem deixa a chave ilegível: a central mostra
 * "cadastre a chave de novo" (o Assistente fica desligado até isso, sem erro para as empresas).
 */

const VERSAO = 'v1'

/** Chave de cifra (32 bytes) a partir do segredo do servidor */
export function chaveDeCifra(segredo: string): Buffer {
  return Buffer.from(hkdfSync('sha256', segredo, 'grafygo-assistente', 'chave-api-provedor-ia', 32))
}

/** Segredo de origem: IA_SEGREDO, ou o JWT_ACCESS_SECRET */
export const segredoDoCofre = (config: { IA_SEGREDO: string; JWT_ACCESS_SECRET: string }) => config.IA_SEGREDO || config.JWT_ACCESS_SECRET

export function cifrarChave(texto: string, segredo: string): string {
  const iv = randomBytes(12)
  const cifra = createCipheriv('aes-256-gcm', chaveDeCifra(segredo), iv)
  const cifrado = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()])
  return [VERSAO, iv.toString('base64url'), cifra.getAuthTag().toString('base64url'), cifrado.toString('base64url')].join(':')
}

/** Texto original, ou null se não abre (segredo trocado, valor adulterado ou formato desconhecido) */
export function decifrarChave(guardado: string, segredo: string): string | null {
  const [versao, iv, tag, cifrado] = guardado.split(':')
  if (versao !== VERSAO || !iv || !tag || !cifrado) return null
  try {
    const decifra = createDecipheriv('aes-256-gcm', chaveDeCifra(segredo), Buffer.from(iv, 'base64url'))
    decifra.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decifra.update(Buffer.from(cifrado, 'base64url')), decifra.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** "••••1234": os 4 últimos caracteres (o resto nunca sai do servidor) */
export const finalDaChave = (chave: string) => chave.slice(-4)
