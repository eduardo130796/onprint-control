import type {
  AcaoAssinatura,
  CupomDetalhe,
  CupomInput,
  CupomPlataforma,
  EmpresaPlataformaDetalhe,
  EmpresaPlataformaResumo,
  EmpresasPlataformaQuery,
  EventoGatewayResumo,
  NovaEmpresaInput,
  PainelPlataforma,
  PlanoInput,
  PlanoPlataforma,
} from '@onprint/shared'
import { API_BASE, ErroApi } from '@/api/http'

/**
 * Sessão do painel da plataforma: separada da sessão das empresas. O token (8 h, sem renovação)
 * fica no sessionStorage: some ao fechar o navegador e não se mistura com o login de uma gráfica.
 */
const CHAVE = 'onprint:plataforma'

export const sessaoPlataforma = {
  token: () => {
    try {
      return sessionStorage.getItem(CHAVE)
    } catch {
      return null
    }
  },
  definir: (token: string | null) => {
    try {
      if (token) sessionStorage.setItem(CHAVE, token)
      else sessionStorage.removeItem(CHAVE)
    } catch {
      // navegador sem armazenamento: a sessão dura até recarregar a página
    }
  },
}

async function chamar<T>(caminho: string, opcoes: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {}): Promise<T> {
  const token = sessaoPlataforma.token()
  let r: Response
  try {
    r = await fetch(`${API_BASE}/plataforma${caminho}`, {
      method: opcoes.method ?? 'GET',
      headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(opcoes.body !== undefined && { 'Content-Type': 'application/json' }) },
      body: opcoes.body === undefined ? undefined : JSON.stringify(opcoes.body),
    })
  } catch {
    throw new ErroApi(0, 'SEM_CONEXAO', 'Sem conexão com o servidor.')
  }
  const corpo = r.status === 204 ? null : await r.json().catch(() => null)
  if (r.status === 401 && token) {
    // Sessão expirou: volta para o login do painel
    sessaoPlataforma.definir(null)
    window.location.assign('/plataforma/login')
  }
  if (!r.ok) throw new ErroApi(r.status, corpo?.error?.code ?? 'ERRO_INTERNO', corpo?.error?.message ?? 'Não foi possível concluir.', corpo?.error?.details)
  return corpo as T
}

const qs = (q: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => Boolean(e[1])))
  return p.size ? `?${p}` : ''
}

export const plataformaApi = {
  login: (email: string, senha: string) => chamar<{ accessToken: string; admin: { nome: string; email: string } }>('/auth/login', { method: 'POST', body: { email, senha } }),
  eu: () => chamar<{ id: string; nome: string; email: string }>('/auth/me'),
  painel: () => chamar<PainelPlataforma>('/painel'),
  empresas: (q: EmpresasPlataformaQuery) => chamar<EmpresaPlataformaResumo[]>(`/empresas${qs(q)}`),
  empresa: (id: string) => chamar<EmpresaPlataformaDetalhe>(`/empresas/${id}`),
  criarEmpresa: (dados: NovaEmpresaInput) => chamar<{ id: string; slug: string; conviteEnviado: boolean }>('/empresas', { method: 'POST', body: dados }),
  acao: (id: string, acao: AcaoAssinatura) => chamar<EmpresaPlataformaDetalhe>(`/empresas/${id}/acoes`, { method: 'POST', body: acao }),
  planos: () => chamar<PlanoPlataforma[]>('/planos'),
  salvarPlano: (id: string | null, dados: PlanoInput) => chamar<unknown>(id ? `/planos/${id}` : '/planos', { method: id ? 'PUT' : 'POST', body: dados }),
  avisos: (soErro: boolean) => chamar<EventoGatewayResumo[]>(`/eventos-gateway${soErro ? '?erro=true' : ''}`),
  reprocessar: (id: string) => chamar<{ ok: true }>(`/eventos-gateway/${id}/reprocessar`, { method: 'POST' }),
  cupons: () => chamar<CupomPlataforma[]>('/cupons'),
  cupom: (id: string) => chamar<CupomDetalhe>(`/cupons/${id}`),
  salvarCupom: (id: string | null, dados: CupomInput) => chamar<CupomPlataforma>(id ? `/cupons/${id}` : '/cupons', { method: id ? 'PUT' : 'POST', body: dados }),
  conciliar: () => chamar<{ cobrancas: number; assinaturas: number; falhas: string[] }>('/conciliar', { method: 'POST' }),
}
