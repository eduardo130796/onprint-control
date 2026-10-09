import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { carregarEnv } from '../src/config/env'
import {
  CacheLru,
  ServicoIndisponivel,
  VALIDADE_CACHE,
  cepDaBrasilApi,
  cepDoViaCep,
  cnpjDaBrasilApi,
  cnpjDoCnpjWs,
  criarConsultas,
  type ConsultasExternas,
} from '../src/integrations/consultas'

// Formatos reais (resumidos) das respostas dos serviços, conferidos em out/2026
const BRASILAPI_CEP = { cep: '01310100', state: 'SP', city: 'São Paulo', neighborhood: 'Bela Vista', street: 'Avenida Paulista', service: 'open-cep' }
const VIACEP = { cep: '01310-100', logradouro: 'Avenida Paulista', complemento: 'de 612 a 1510 - lado par', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' }
const BRASILAPI_CNPJ = {
  uf: 'RJ',
  cep: '20031170',
  cnpj: '33000167000101',
  email: null,
  bairro: 'CENTRO',
  numero: '65',
  municipio: 'RIO DE JANEIRO',
  logradouro: 'REPUBLICA DO CHILE',
  complemento: '',
  razao_social: 'PETROLEO BRASILEIRO S A PETROBRAS',
  nome_fantasia: 'PETROBRAS - EDISE',
  ddd_telefone_1: '2121660000',
  descricao_situacao_cadastral: 'ATIVA',
  descricao_tipo_de_logradouro: 'AVENIDA',
}
const CNPJWS = {
  razao_social: 'PETROLEO BRASILEIRO S A PETROBRAS',
  estabelecimento: {
    cnpj: '33000167000101',
    nome_fantasia: 'PETROBRAS - EDISE',
    situacao_cadastral: 'Ativa',
    tipo_logradouro: 'AVENIDA',
    logradouro: 'REPUBLICA DO CHILE',
    numero: '65',
    complemento: null,
    bairro: 'CENTRO',
    cep: '20031170',
    ddd1: '21',
    telefone1: '21660000',
    email: 'CC-RFISC@petrobras.com.br',
    cidade: { nome: 'Rio de Janeiro' },
    estado: { sigla: 'RJ' },
    inscricoes_estaduais: [
      { inscricao_estadual: '0748878600131', ativo: false, estado: { sigla: 'DF' } },
      { inscricao_estadual: '283058749', ativo: true, estado: { sigla: 'MS' } },
      { inscricao_estadual: '81281882', ativo: true, estado: { sigla: 'RJ' } },
    ],
  },
}

type Resposta = { status: number; corpo?: unknown } | 'erro'

/** fetch falso: cada URL (por trecho) devolve a resposta configurada; registra as chamadas. */
function fetchFalso(rotas: Record<string, Resposta>) {
  const chamadas: string[] = []
  const buscar = (async (url: string | URL | Request) => {
    const u = String(url)
    chamadas.push(u)
    const chave = Object.keys(rotas).find((k) => u.includes(k))
    const r: Resposta = chave ? rotas[chave]! : { status: 500 }
    if (r === 'erro') throw new TypeError('fetch failed')
    return new Response(r.corpo === undefined ? 'erro' : JSON.stringify(r.corpo), { status: r.status })
  }) as typeof fetch
  return { buscar, chamadas }
}

describe('consultas: normalização', () => {
  it('CEP da BrasilAPI e do ViaCEP', () => {
    const esperado = { cep: '01310100', logradouro: 'Avenida Paulista', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP' }
    expect(cepDaBrasilApi(BRASILAPI_CEP)).toEqual(esperado)
    expect(cepDoViaCep(VIACEP)).toEqual(esperado)
    expect(cepDoViaCep({ erro: 'true' })).toBeNull()
    expect(cepDoViaCep({ erro: true })).toBeNull()
    expect(cepDaBrasilApi({ cep: '01001000', state: 'sp', city: 'SAO PAULO', neighborhood: 'SE', street: 'PRACA DA SE' })).toMatchObject({
      logradouro: 'Praca da Se',
      cidade: 'Sao Paulo',
      uf: 'SP',
    })
  })

  it('CNPJ da BrasilAPI e da CNPJ.ws chegam ao mesmo formato', () => {
    const endereco = { cep: '20031170', logradouro: 'Avenida Republica do Chile', numero: '65', complemento: '', bairro: 'Centro', cidade: 'Rio de Janeiro', uf: 'RJ' }
    const a = cnpjDaBrasilApi(BRASILAPI_CNPJ)
    expect(a).toEqual({
      cnpj: '33000167000101',
      razaoSocial: 'PETROLEO BRASILEIRO S A PETROBRAS',
      nomeFantasia: 'PETROBRAS - EDISE',
      situacao: 'ATIVA',
      ativa: true,
      email: '',
      telefone: '2121660000',
      endereco,
    })
    const b = cnpjDoCnpjWs(CNPJWS)
    expect(b).toEqual({ ...a, email: 'cc-rfisc@petrobras.com.br', endereco, inscricaoEstadual: '81281882' })
  })

  it('situação diferente de ATIVA e logradouro que já traz o tipo', () => {
    const d = cnpjDaBrasilApi({ ...BRASILAPI_CNPJ, descricao_situacao_cadastral: 'Baixada', logradouro: 'AVENIDA BRASIL', complemento: 'SALA 2', numero: '00186' })
    expect(d).toMatchObject({ situacao: 'BAIXADA', ativa: false })
    expect(d.endereco).toMatchObject({ logradouro: 'Avenida Brasil', complemento: 'Sala 2', numero: '186' })
    // Sem IE ativa na UF da empresa: o campo nem aparece
    const semIe = cnpjDoCnpjWs({ ...CNPJWS, estabelecimento: { ...CNPJWS.estabelecimento, inscricoes_estaduais: [] } })
    expect(semIe).not.toHaveProperty('inscricaoEstadual')
  })
})

describe('consultas: cache LRU', () => {
  it('expira pela validade e descarta o menos usado', () => {
    let agora = 0
    const cache = new CacheLru<number>(2, () => agora)
    cache.guardar('a', 1, 100)
    cache.guardar('b', 2, 100)
    expect(cache.obter('a')).toEqual({ valor: 1 }) // "a" passa a ser o mais recente
    cache.guardar('c', 3, 100)
    expect(cache.obter('b')).toBeUndefined()
    expect(cache.tamanho).toBe(2)
    agora = 100
    expect(cache.obter('a')).toBeUndefined()
  })
})

describe('consultas: serviços em ordem', () => {
  it('CEP: usa a BrasilAPI e guarda no cache', async () => {
    const f = fetchFalso({ 'brasilapi.com.br/api/cep': { status: 200, corpo: BRASILAPI_CEP } })
    const c = criarConsultas({ buscar: f.buscar })
    expect(await c.cep('01310-100')).toMatchObject({ cidade: 'São Paulo', uf: 'SP' })
    expect(await c.cep('01310100')).toMatchObject({ cidade: 'São Paulo' })
    expect(f.chamadas).toEqual(['https://brasilapi.com.br/api/cep/v2/01310100'])
  })

  it('CEP: BrasilAPI fora do ar ou com 404 → ViaCEP', async () => {
    for (const falha of ['erro', { status: 503 }, { status: 404, corpo: { message: 'x' } }] as Resposta[]) {
      const f = fetchFalso({ 'brasilapi.com.br': falha, 'viacep.com.br': { status: 200, corpo: VIACEP } })
      expect(await criarConsultas({ buscar: f.buscar }).cep('01310100')).toMatchObject({ logradouro: 'Avenida Paulista', cep: '01310100' })
      expect(f.chamadas).toHaveLength(2)
    }
  })

  it('CEP inexistente → null (e fica no cache por pouco tempo)', async () => {
    let agora = 0
    const f = fetchFalso({ 'brasilapi.com.br': { status: 404, corpo: {} }, 'viacep.com.br': { status: 200, corpo: { erro: 'true' } } })
    const c = criarConsultas({ buscar: f.buscar, agora: () => agora })
    expect(await c.cep('99999998')).toBeNull()
    expect(await c.cep('99999998')).toBeNull()
    expect(f.chamadas).toHaveLength(2)
    agora = VALIDADE_CACHE.naoEncontrado
    await c.cep('99999998')
    expect(f.chamadas).toHaveLength(4)
  })

  it('todos fora do ar → ServicoIndisponivel (sem cache)', async () => {
    const f = fetchFalso({ 'brasilapi.com.br': 'erro', 'viacep.com.br': { status: 500 }, 'cnpj.ws': { status: 429, corpo: {} } })
    const c = criarConsultas({ buscar: f.buscar })
    await expect(c.cep('01310100')).rejects.toBeInstanceOf(ServicoIndisponivel)
    await expect(c.cnpj('33000167000101')).rejects.toBeInstanceOf(ServicoIndisponivel)
    await expect(c.cep('01310100')).rejects.toBeInstanceOf(ServicoIndisponivel)
  })

  it('JSON inválido ou resposta sem cidade conta como falha do serviço', async () => {
    const f = fetchFalso({ 'brasilapi.com.br': { status: 200 }, 'viacep.com.br': { status: 200, corpo: { ...VIACEP, localidade: '' } } })
    // BrasilAPI falhou (corpo não é JSON) e o ViaCEP não trouxe cidade: "não encontrado"
    expect(await criarConsultas({ buscar: f.buscar }).cep('01310100')).toBeNull()
  })

  it('CNPJ: BrasilAPI → CNPJ.ws; 404 da BrasilAPI encerra sem gastar a cota da CNPJ.ws', async () => {
    const ok = fetchFalso({ 'brasilapi.com.br': { status: 403 }, 'publica.cnpj.ws': { status: 200, corpo: CNPJWS } })
    expect(await criarConsultas({ buscar: ok.buscar }).cnpj('33.000.167/0001-01')).toMatchObject({ razaoSocial: 'PETROLEO BRASILEIRO S A PETROBRAS', inscricaoEstadual: '81281882' })
    expect(ok.chamadas).toEqual(['https://brasilapi.com.br/api/cnpj/v1/33000167000101', 'https://publica.cnpj.ws/cnpj/33000167000101'])

    const naoExiste = fetchFalso({ 'brasilapi.com.br': { status: 404, corpo: { message: 'CNPJ não encontrado' } } })
    expect(await criarConsultas({ buscar: naoExiste.buscar }).cnpj('33000167000101')).toBeNull()
    expect(naoExiste.chamadas).toHaveLength(1)
  })

  it('só dígitos válidos viram URL (CNPJ com dígito errado nem é consultado)', async () => {
    const f = fetchFalso({})
    const c = criarConsultas({ buscar: f.buscar })
    expect(await c.cnpj('33000167000102')).toBeNull()
    expect(await c.cep('0131010')).toBeNull()
    expect(await c.cep('../../x')).toBeNull()
    expect(f.chamadas).toHaveLength(0)
  })
})

describe('consultas: rotas', () => {
  const config = carregarEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://x:x@localhost:1/x',
    JWT_ACCESS_SECRET: 'segredo-de-teste',
    JWT_REFRESH_SECRET: 'segredo-de-teste-2',
    LOG_LEVEL: 'silent',
  })
  let app: Awaited<ReturnType<typeof buildApp>>
  let falso: ConsultasExternas

  beforeAll(async () => {
    app = await buildApp(config)
    app.empresas.porId = async (id) => (id === 'e1' ? { id: 'e1', nome: 'Gráfica Teste', slug: 'grafica-teste', schema: 'emp_teste' } : null)
    app.situacaoUsuario = async () => ({ ativo: true, papelId: 'p1', deveTrocarSenha: false })
    app.consultas = { cep: (cep) => falso.cep(cep), cnpj: (cnpj) => falso.cnpj(cnpj) }
    await app.ready()
  })
  afterAll(() => app.close())

  const auth = (sub = 'u1') => ({ authorization: `Bearer ${app.jwt.sign({ sub, papelId: 'p1', dts: false, emp: 'e1' })}` })
  const get = (url: string, sub?: string) => app.inject({ method: 'GET', url: `/api/v1/consultas${url}`, headers: auth(sub) })

  it('exige login', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/consultas/cep/01310100' })
    expect(r.statusCode).toBe(401)
  })

  it('valida CEP e CNPJ (só dígitos, dígito verificador)', async () => {
    falso = { cep: async () => null, cnpj: async () => null }
    for (const url of ['/cep/0131010', '/cep/01310-100', '/cnpj/33000167000102', '/cnpj/abc']) {
      const r = await get(url)
      expect(r.statusCode, url).toBe(400)
    }
  })

  it('200, 404 e 503 (nunca 500 por falha externa)', async () => {
    falso = criarConsultas({ buscar: fetchFalso({ 'brasilapi.com.br/api/cep': { status: 200, corpo: BRASILAPI_CEP } }).buscar })
    const ok = await get('/cep/01310100', 'u2')
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toEqual({ cep: '01310100', logradouro: 'Avenida Paulista', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP' })

    falso = { cep: async () => null, cnpj: async () => null }
    const nao = await get('/cnpj/33000167000101', 'u2')
    expect(nao.statusCode).toBe(404)
    expect(nao.json().error.message).toBe('CNPJ não encontrado na Receita Federal.')

    falso = { cep: () => Promise.reject(new ServicoIndisponivel()), cnpj: () => Promise.reject(new Error('inesperado')) }
    for (const url of ['/cep/01310100', '/cnpj/33000167000101']) {
      const r = await get(url, 'u2')
      expect(r.statusCode).toBe(503)
      expect(r.json().error).toEqual({ code: 'SERVICO_INDISPONIVEL', message: 'Serviço de consulta indisponível agora. Preencha manualmente.' })
    }
  })

  it('limita 30 consultas por minuto por usuário', async () => {
    falso = { cep: async () => null, cnpj: async () => null }
    const codigos: number[] = []
    for (let i = 0; i < 31; i++) codigos.push((await get('/cep/01310100', 'u3')).statusCode)
    expect(codigos.slice(0, 30).every((c) => c === 404)).toBe(true)
    expect(codigos[30]).toBe(429)
    // Outro usuário tem a própria cota
    expect((await get('/cep/01310100', 'u4')).statusCode).toBe(404)
  })
})
