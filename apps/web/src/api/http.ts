import type { ErroApi as CorpoErroApi, RespostaLogin } from '@onprint/shared'

export const API_BASE = '/api/v1'

/** Erro vindo da API, já no formato padrão { error: { code, message, details } }. */
export class ErroApi extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ErroApi'
  }
}

// O access token fica só em memória; o refresh token fica no cookie httpOnly.
let accessToken: string | null = null

/** Token atual (para o Socket.IO, que não passa pelo fetch). */
export const obterAccessToken = () => accessToken
let renovacaoEmAndamento: Promise<RespostaLogin | null> | null = null
let aoExpirarSessao: (() => void) | null = null

// Marca (sem segredo) de que houve login neste navegador: evita tentar renovar — e o 401 no console — sem sessão
const MARCA_SESSAO = 'onprint:sessao'
function marcarSessao(ativa: boolean) {
  try {
    if (ativa) localStorage.setItem(MARCA_SESSAO, '1')
    else localStorage.removeItem(MARCA_SESSAO)
  } catch {
    // armazenamento bloqueado: segue sem a marca
  }
}
export function talvezHajaSessao() {
  try {
    return localStorage.getItem(MARCA_SESSAO) === '1'
  } catch {
    return true
  }
}

export function definirAccessToken(token: string | null) {
  accessToken = token
  marcarSessao(token !== null)
}

export function aoSessaoExpirar(callback: () => void) {
  aoExpirarSessao = callback
}

async function lerErro(resposta: Response): Promise<ErroApi> {
  try {
    const corpo = (await resposta.json()) as CorpoErroApi
    return new ErroApi(resposta.status, corpo.error.code, corpo.error.message, corpo.error.details)
  } catch {
    return new ErroApi(resposta.status, 'ERRO_INTERNO', 'Não foi possível falar com o servidor.')
  }
}

/**
 * Renova o access token pelo cookie de refresh. Chamadas simultâneas compartilham
 * a mesma requisição (o refresh token é rotativo e só pode ser usado uma vez).
 */
export function renovarSessao(): Promise<RespostaLogin | null> {
  renovacaoEmAndamento ??= fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (r) => {
      if (!r.ok) {
        marcarSessao(false)
        return null
      }
      const dados = (await r.json()) as RespostaLogin
      definirAccessToken(dados.accessToken)
      return dados
    })
    .catch(() => null)
    .finally(() => {
      renovacaoEmAndamento = null
    })
  return renovacaoEmAndamento
}

interface OpcoesHttp {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** false para rotas públicas (sem Authorization e sem renovação) */
  autenticado?: boolean
  signal?: AbortSignal
}

export async function http<T>(caminho: string, opcoes: OpcoesHttp = {}, jaRenovou = false): Promise<T> {
  const { method = 'GET', body, autenticado = true, signal } = opcoes
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (autenticado && accessToken) headers.Authorization = `Bearer ${accessToken}`

  let resposta: Response
  try {
    resposta = await fetch(`${API_BASE}${caminho}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      signal,
    })
  } catch {
    throw new ErroApi(0, 'SEM_CONEXAO', 'Sem conexão com o servidor. A API está rodando?')
  }

  if (resposta.status === 401 && autenticado && !jaRenovou) {
    const renovada = await renovarSessao()
    if (renovada) return http<T>(caminho, opcoes, true)
    aoExpirarSessao?.()
  }

  if (!resposta.ok) throw await lerErro(resposta)
  if (resposta.status === 204) return undefined as T
  return (await resposta.json()) as T
}

/** Monta a query string ignorando valores vazios: qs({ page: 1, busca: '' }) → "?page=1". */
export function qs(params: Record<string, unknown>): string {
  const busca = new URLSearchParams()
  for (const [chave, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== null && valor !== '') busca.set(chave, String(valor))
  }
  const texto = busca.toString()
  return texto ? `?${texto}` : ''
}

/** Upload multipart com progresso (0–100). Renova o token uma vez se receber 401. */
export function upload<T>(caminho: string, arquivo: File, aoProgredir?: (pct: number) => void, jaRenovou = false): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}${caminho}`)
    xhr.withCredentials = true
    if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) aoProgredir?.(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onerror = () => reject(new ErroApi(0, 'SEM_CONEXAO', 'Falha de conexão durante o envio.'))
    xhr.onload = async () => {
      if (xhr.status === 401 && !jaRenovou && (await renovarSessao())) {
        upload<T>(caminho, arquivo, aoProgredir, true).then(resolve, reject)
        return
      }
      let corpo: unknown = null
      try {
        corpo = xhr.responseText ? JSON.parse(xhr.responseText) : null
      } catch {
        corpo = null
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(corpo as T)
      const erro = (corpo as CorpoErroApi | null)?.error
      reject(new ErroApi(xhr.status, erro?.code ?? 'ERRO_INTERNO', erro?.message ?? 'Não foi possível enviar o arquivo.'))
    }
    const form = new FormData()
    form.append('arquivo', arquivo)
    xhr.send(form)
  })
}
