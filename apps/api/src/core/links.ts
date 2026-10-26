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

/** Link absoluto de uma tela do sistema ({APP_URL}/orcamentos/…): os avisos do Assistente na conversa "Você" */
export function linkSistema(caminho: string): string {
  return `${urlSistema}${caminho.startsWith('/') ? caminho : `/${caminho}`}`
}

/** Link público de aprovação do orçamento da empresa em uso: {APP_URL}/aprovar/{slug}/{token} (o mesmo da web) */
export function linkAprovacaoOrcamento(token: string, slug = contextoEmpresa.exigir().slug): string {
  return `${urlSistema}/aprovar/${encodeURIComponent(slug)}/${token}`
}
