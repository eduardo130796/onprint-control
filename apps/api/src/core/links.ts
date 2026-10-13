import { caminhoAcompanhamento } from '@onprint/shared'
import { contextoEmpresa } from './contexto-empresa'

/** Endereço do sistema (APP_URL), definido ao montar a API: os links que vão nas mensagens ao cliente partem dele. */
let urlSistema = ''

export function definirUrlSistema(url: string) {
  urlSistema = url.replace(/\/+$/, '')
}

/** Link absoluto "Acompanhe seu pedido" da empresa em uso: {APP_URL}/pedido/{slug}/{token}. */
export function linkAcompanhamento(token: string, slug = contextoEmpresa.exigir().slug): string {
  return `${urlSistema}${caminhoAcompanhamento(slug, token)}`
}
