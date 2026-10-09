import { capitalizarNome, cnpjValido, somenteDigitos, type DadosCnpj, type EnderecoCep } from '@onprint/shared'

/**
 * Consulta de CEP (BrasilAPI → ViaCEP) e CNPJ (BrasilAPI → CNPJ.ws pública).
 * As URLs são modelos fixos completados só com dígitos já validados (sem SSRF).
 * Resultado em cache na memória (LRU com validade); falha dos serviços vira ServicoIndisponivel.
 */

/** Todos os serviços falharam (fora do ar, lentos ou limitando): o usuário preenche à mão. */
export class ServicoIndisponivel extends Error {
  constructor() {
    super('Serviço de consulta indisponível.')
    this.name = 'ServicoIndisponivel'
  }
}

export interface ConsultasExternas {
  /** null = CEP não existe */
  cep(cep: string): Promise<EnderecoCep | null>
  /** null = CNPJ não existe na Receita */
  cnpj(cnpj: string): Promise<DadosCnpj | null>
}

export interface OpcoesConsultas {
  /** Injetável nos testes */
  buscar?: typeof fetch
  timeoutMs?: number
  agora?: () => number
  maxCache?: number
}

const DIA = 24 * 60 * 60 * 1000
export const VALIDADE_CACHE = { cep: 7 * DIA, cnpj: DIA, naoEncontrado: 60 * 60 * 1000 }
// A BrasilAPI recusa (403) chamadas sem User-Agent
const CABECALHOS = { Accept: 'application/json', 'User-Agent': 'ONPrintControl/1.0 (consulta de cadastro)' }

/** Cache simples: Map em ordem de uso; passou do limite, sai o menos usado. */
export class CacheLru<T> {
  private readonly itens = new Map<string, { valor: T; expira: number }>()
  constructor(
    private readonly max: number,
    private readonly agora: () => number = Date.now,
  ) {}

  obter(chave: string): { valor: T } | undefined {
    const item = this.itens.get(chave)
    if (!item) return undefined
    this.itens.delete(chave)
    if (item.expira <= this.agora()) return undefined
    this.itens.set(chave, item)
    return { valor: item.valor }
  }

  guardar(chave: string, valor: T, validadeMs: number) {
    this.itens.delete(chave)
    this.itens.set(chave, { valor, expira: this.agora() + validadeMs })
    while (this.itens.size > this.max) this.itens.delete(this.itens.keys().next().value as string)
  }

  get tamanho() {
    return this.itens.size
  }
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : typeof v === 'number' ? String(v) : '')
const sigla = (v: unknown) => texto(v).toUpperCase().slice(0, 2)
/** A Receita completa o número com zeros ("00186") */
const numero = (v: unknown) => texto(v).replace(/^0+(?=\d)/, '')

// ─── Normalização (exportada para os testes) ─────────────────────────────────

/** BrasilAPI /cep/v2: { cep, state, city, neighborhood, street } */
export function cepDaBrasilApi(d: Record<string, unknown>): EnderecoCep {
  return {
    cep: somenteDigitos(texto(d.cep)),
    logradouro: capitalizarNome(texto(d.street)),
    bairro: capitalizarNome(texto(d.neighborhood)),
    cidade: capitalizarNome(texto(d.city)),
    uf: sigla(d.state),
  }
}

/** ViaCEP: { cep, logradouro, bairro, localidade, uf } ou { erro: true | "true" } */
export function cepDoViaCep(d: Record<string, unknown>): EnderecoCep | null {
  if (d.erro === true || d.erro === 'true') return null
  return {
    cep: somenteDigitos(texto(d.cep)),
    logradouro: capitalizarNome(texto(d.logradouro)),
    bairro: capitalizarNome(texto(d.bairro)),
    cidade: capitalizarNome(texto(d.localidade)),
    uf: sigla(d.uf),
  }
}

/** "AVENIDA" + "REPUBLICA DO CHILE" → "Avenida Republica do Chile" (sem repetir o tipo se já vier no nome). */
function juntarLogradouro(tipo: string, nome: string) {
  if (!nome) return ''
  if (!tipo || nome.toUpperCase().startsWith(`${tipo.toUpperCase()} `)) return capitalizarNome(nome)
  return capitalizarNome(`${tipo} ${nome}`)
}

/** BrasilAPI /cnpj/v1 (dados da Receita, tudo em maiúsculas). Razão social e fantasia ficam como a Receita registra. */
export function cnpjDaBrasilApi(d: Record<string, unknown>): DadosCnpj {
  const situacao = texto(d.descricao_situacao_cadastral).toUpperCase()
  return {
    cnpj: somenteDigitos(texto(d.cnpj)),
    razaoSocial: texto(d.razao_social),
    nomeFantasia: texto(d.nome_fantasia),
    situacao,
    ativa: situacao === 'ATIVA',
    email: texto(d.email).toLowerCase(),
    telefone: somenteDigitos(texto(d.ddd_telefone_1)),
    endereco: {
      cep: somenteDigitos(texto(d.cep)),
      logradouro: juntarLogradouro(texto(d.descricao_tipo_de_logradouro), texto(d.logradouro)),
      numero: numero(d.numero),
      complemento: capitalizarNome(texto(d.complemento)),
      bairro: capitalizarNome(texto(d.bairro)),
      cidade: capitalizarNome(texto(d.municipio)),
      uf: sigla(d.uf),
    },
  }
}

interface EstabelecimentoCnpjWs {
  cnpj?: string
  nome_fantasia?: string | null
  situacao_cadastral?: string
  tipo_logradouro?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cep?: string | null
  ddd1?: string | null
  telefone1?: string | null
  email?: string | null
  cidade?: { nome?: string } | null
  estado?: { sigla?: string } | null
  inscricoes_estaduais?: { inscricao_estadual?: string; ativo?: boolean; estado?: { sigla?: string } }[]
}

/** CNPJ.ws pública: { razao_social, estabelecimento: { ... } } */
export function cnpjDoCnpjWs(d: Record<string, unknown>): DadosCnpj {
  const e = (d.estabelecimento ?? {}) as EstabelecimentoCnpjWs
  const situacao = texto(e.situacao_cadastral).toUpperCase()
  const uf = sigla(e.estado?.sigla)
  // Só a inscrição ativa no estado da própria empresa (as de outras UFs são de substituição tributária)
  const ie = e.inscricoes_estaduais?.find((i) => i.ativo && sigla(i.estado?.sigla) === uf)?.inscricao_estadual
  return {
    cnpj: somenteDigitos(texto(e.cnpj)),
    razaoSocial: texto(d.razao_social),
    nomeFantasia: texto(e.nome_fantasia),
    situacao,
    ativa: situacao === 'ATIVA',
    email: texto(e.email).toLowerCase(),
    telefone: somenteDigitos(`${texto(e.ddd1)}${texto(e.telefone1)}`),
    endereco: {
      cep: somenteDigitos(texto(e.cep)),
      logradouro: juntarLogradouro(texto(e.tipo_logradouro), texto(e.logradouro)),
      numero: numero(e.numero),
      complemento: capitalizarNome(texto(e.complemento)),
      bairro: capitalizarNome(texto(e.bairro)),
      cidade: capitalizarNome(texto(e.cidade?.nome)),
      uf,
    },
    ...(ie ? { inscricaoEstadual: texto(ie) } : {}),
  }
}

// ─── Consulta com fallback ───────────────────────────────────────────────────

interface Servico<T> {
  url: string
  /** null = o serviço respondeu, mas sem o registro (ou sem o mínimo útil) */
  ler: (d: Record<string, unknown>) => T | null
  /** "Não existe" deste serviço encerra a busca (senão o próximo ainda é consultado) */
  confiarNoNaoEncontrado: boolean
}

export function criarConsultas(opcoes: OpcoesConsultas = {}): ConsultasExternas {
  const buscar = opcoes.buscar ?? fetch
  const timeoutMs = opcoes.timeoutMs ?? 5000
  const cache = new CacheLru<unknown>(opcoes.maxCache ?? 2000, opcoes.agora)

  /** GET com tempo limite: dados, 'nao_encontrado' (404) ou 'falha' (qualquer outro problema). */
  async function obterJson(url: string): Promise<Record<string, unknown> | 'nao_encontrado' | 'falha'> {
    try {
      const resposta = await buscar(url, { headers: CABECALHOS, signal: AbortSignal.timeout(timeoutMs), redirect: 'error' })
      if (resposta.status === 404) return 'nao_encontrado'
      if (!resposta.ok) return 'falha'
      const corpo = (await resposta.json()) as unknown
      return corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : 'falha'
    } catch {
      return 'falha'
    }
  }

  async function consultar<T>(chave: string, validade: number, servicos: Servico<T>[]): Promise<T | null> {
    const guardado = cache.obter(chave)
    if (guardado) return guardado.valor as T | null
    let naoEncontrado = false
    for (const s of servicos) {
      const r = await obterJson(s.url)
      if (r === 'falha') continue
      let valor: T | null = null
      if (r !== 'nao_encontrado') {
        try {
          valor = s.ler(r)
        } catch {
          continue
        }
      }
      if (valor !== null) {
        cache.guardar(chave, valor, validade)
        return valor
      }
      naoEncontrado = true
      if (s.confiarNoNaoEncontrado) break
    }
    if (!naoEncontrado) throw new ServicoIndisponivel()
    cache.guardar(chave, null, VALIDADE_CACHE.naoEncontrado)
    return null
  }

  /** Endereço sem cidade/UF não serve: conta como "não encontrado" naquele serviço. */
  const cepUtil = (e: EnderecoCep | null, cep: string) => (e && e.cidade && e.uf.length === 2 ? { ...e, cep } : null)

  return {
    cep(cep) {
      const d = somenteDigitos(cep)
      if (!/^\d{8}$/.test(d)) return Promise.resolve(null)
      return consultar<EnderecoCep>(`cep:${d}`, VALIDADE_CACHE.cep, [
        // O 404 da BrasilAPI às vezes é falha dos serviços dela: o ViaCEP ainda confere
        { url: `https://brasilapi.com.br/api/cep/v2/${d}`, ler: (j) => cepUtil(cepDaBrasilApi(j), d), confiarNoNaoEncontrado: false },
        { url: `https://viacep.com.br/ws/${d}/json/`, ler: (j) => cepUtil(cepDoViaCep(j), d), confiarNoNaoEncontrado: true },
      ])
    },
    cnpj(cnpj) {
      const d = somenteDigitos(cnpj)
      if (!cnpjValido(d)) return Promise.resolve(null)
      const util = (dados: DadosCnpj) => (dados.razaoSocial ? { ...dados, cnpj: d } : null)
      return consultar<DadosCnpj>(`cnpj:${d}`, VALIDADE_CACHE.cnpj, [
        // A BrasilAPI só responde 404 quando a Receita não tem o CNPJ: não gasta a cota da CNPJ.ws (3/min)
        { url: `https://brasilapi.com.br/api/cnpj/v1/${d}`, ler: (j) => util(cnpjDaBrasilApi(j)), confiarNoNaoEncontrado: true },
        { url: `https://publica.cnpj.ws/cnpj/${d}`, ler: (j) => util(cnpjDoCnpjWs(j)), confiarNoNaoEncontrado: true },
      ])
    },
  }
}

/** Consultas desligadas (CONSULTAS_EXTERNAS=false): sempre "indisponível", o usuário preenche à mão. */
export const consultasDesligadas: ConsultasExternas = {
  cep: () => Promise.reject(new ServicoIndisponivel()),
  cnpj: () => Promise.reject(new ServicoIndisponivel()),
}
