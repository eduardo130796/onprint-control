import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { carregarEnv } from '../src/config/env'
import { calcularAcesso, modulosLiberados } from '@onprint/shared'
import { contextoEmpresa } from '../src/core/contexto-empresa'
import type { AssinaturaContexto } from '../src/plataforma/assinaturas'

// Estes testes não tocam o banco: validam contrato de erros e proteção das rotas.
const config = carregarEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://x:x@localhost:1/x',
  JWT_ACCESS_SECRET: 'segredo-de-teste',
  JWT_REFRESH_SECRET: 'segredo-de-teste-2',
  LOG_LEVEL: 'silent',
})

let app: Awaited<ReturnType<typeof buildApp>>

beforeAll(async () => {
  app = await buildApp(config)
  // Sem banco: só a empresa "e1" existe (as demais contam como inexistentes ou desativadas)
  app.empresas.porId = async (id) => (id === 'e1' ? { id: 'e1', nome: 'Gráfica Teste', slug: 'grafica-teste', schema: 'emp_teste' } : null)
  // Rotas protegidas por `autenticar` registradas só para os testes; devolvem a empresa vista pelo handler
  const empresaDoContexto = async () => ({ ok: true, empresa: contextoEmpresa.atual()?.slug ?? null })
  app.get('/teste/protegida', { onRequest: [app.autenticar] }, empresaDoContexto)
  app.post('/teste/protegida', { onRequest: [app.autenticar] }, empresaDoContexto)
  app.get('/teste/livre', { onRequest: [app.autenticar], config: { assinaturaLivre: true } }, empresaDoContexto)
  app.post('/teste/sem-escrita', { onRequest: [app.autenticar], config: { semEscrita: true } }, empresaDoContexto)
  app.get('/teste/estoque', { onRequest: [app.exigirPermissao('estoque', 'visualizar')] }, empresaDoContexto)
  await app.ready()
})

function bearer(dts: boolean, emp = 'e1') {
  return { authorization: `Bearer ${app.jwt.sign({ sub: 'u1', papelId: 'p1', dts, emp })}` }
}
afterAll(() => app.close())

describe('API — contrato de erros', () => {
  it('404 no formato padrão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/nao-existe' })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('NAO_ENCONTRADO')
  })

  it('400 de validação no login com detalhes por campo', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'x' } })
    expect(res.statusCode).toBe(400)
    const corpo = res.json()
    expect(corpo.error.code).toBe('VALIDACAO')
    expect(Array.isArray(corpo.error.details)).toBe(true)
  })

  it('limite de login por IP + e-mail (a 6ª tentativa da mesma conta é barrada; outra conta segue)', async () => {
    const tentar = (email: string) => app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, senha: 'qualquer1' } })
    for (let i = 0; i < 5; i++) expect((await tentar('alvo@onprint.local')).statusCode).not.toBe(429)
    expect((await tentar('ALVO@onprint.local ')).statusCode).toBe(429)
    expect((await tentar('outra@onprint.local')).statusCode).not.toBe(429)
  })

  it('401 em /auth/me sem token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('NAO_AUTENTICADO')
  })

  it('checa login ANTES de validar o corpo (401, nunca 400, sem token)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/clientes', payload: {} })
    expect(res.statusCode).toBe(401)
  })

  it('401 em /auth/refresh sem cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh' })
    expect(res.statusCode).toBe(401)
  })

  it('403 TROCA_SENHA_OBRIGATORIA quando o token exige troca de senha', async () => {
    const res = await app.inject({ method: 'GET', url: '/teste/protegida', headers: bearer(true) })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('TROCA_SENHA_OBRIGATORIA')
  })

  it('libera a rota protegida com token válido e senha já trocada', async () => {
    const res = await app.inject({ method: 'GET', url: '/teste/protegida', headers: bearer(false) })
    expect(res.statusCode).toBe(200)
  })
})

describe('API — multiempresa', () => {
  it('o handler enxerga a empresa do token (GET e POST com corpo)', async () => {
    const get = await app.inject({ method: 'GET', url: '/teste/protegida', headers: bearer(false) })
    expect(get.json().empresa).toBe('grafica-teste')
    const post = await app.inject({ method: 'POST', url: '/teste/protegida', headers: bearer(false), payload: { qualquer: 'coisa' } })
    expect(post.json().empresa).toBe('grafica-teste')
  })

  it('401 se a empresa do token não existe ou foi desativada', async () => {
    const res = await app.inject({ method: 'GET', url: '/teste/protegida', headers: bearer(false, 'e2') })
    expect(res.statusCode).toBe(401)
  })

  it('requisições simultâneas de empresas diferentes não se misturam', async () => {
    app.empresas.porId = async (id) => {
      await new Promise((r) => setTimeout(r, id === 'e1' ? 30 : 5))
      return id ? { id, nome: id, slug: `slug-${id}`, schema: `emp_${id}` } : null
    }
    const respostas = await Promise.all(['e1', 'e2', 'e1', 'e3'].map((emp) => app.inject({ method: 'POST', url: '/teste/protegida', headers: bearer(false, emp), payload: {} })))
    expect(respostas.map((r) => r.json().empresa)).toEqual(['slug-e1', 'slug-e2', 'slug-e1', 'slug-e3'])
  })

  it('webhook do Asaas sem o token certo é recusado (antes de tocar no banco)', async () => {
    const semToken = await app.inject({ method: 'POST', url: '/api/v1/plataforma/webhooks/asaas', payload: { id: 'evt_1', event: 'PAYMENT_RECEIVED' } })
    expect(semToken.statusCode).toBe(401)
    const errado = await app.inject({ method: 'POST', url: '/api/v1/plataforma/webhooks/asaas', headers: { 'asaas-access-token': 'qualquer' }, payload: {} })
    expect(errado.statusCode).toBe(401)
  })

  it('link público com empresa inexistente responde 404', async () => {
    app.empresas.porSlug = async () => null
    const res = await app.inject({ method: 'GET', url: '/api/v1/publico/nao-existe/orcamentos/abcdefghijklmnopqrstuvwxyz' })
    expect(res.statusCode).toBe(404)
  })
})

describe('API — assinatura', () => {
  const HOJE = '2026-10-20'
  /** Empresa e1 com assinatura no plano Essencial (sem estoque), em atraso desde a data dada. */
  function empresaComAtraso(atrasoDesde: string | null, extra: { bloqueioManual?: boolean } = {}) {
    const assinatura: AssinaturaContexto = {
      plano: { codigo: 'essencial', nome: 'Essencial' },
      modulos: modulosLiberados(['pedidos', 'clientes']),
      limiteUsuarios: 3,
      acesso: calcularAcesso({ situacao: 'ativa', atrasoDesde, diasAteSomenteLeitura: 5, diasAteBloqueio: 15, ...extra }, HOJE),
    }
    app.empresas.porId = async (id) => (id === 'e1' ? { id: 'e1', nome: 'Gráfica Teste', slug: 'grafica-teste', schema: 'emp_teste', assinatura } : null)
  }
  const pedir = (method: 'GET' | 'POST', url: string) => app.inject({ method, url, headers: bearer(false), ...(method === 'POST' ? { payload: {} } : {}) })

  it('em dia e com aviso: tudo liberado', async () => {
    empresaComAtraso(null)
    expect((await pedir('POST', '/teste/protegida')).statusCode).toBe(200)
    empresaComAtraso('2026-10-18')
    expect((await pedir('POST', '/teste/protegida')).statusCode).toBe(200)
  })

  it('só leitura: consulta sim, gravação não (exceto POST que não grava)', async () => {
    empresaComAtraso('2026-10-10')
    expect((await pedir('GET', '/teste/protegida')).statusCode).toBe(200)
    const post = await pedir('POST', '/teste/protegida')
    expect(post.statusCode).toBe(403)
    expect(post.json().error.code).toBe('ASSINATURA_SOMENTE_LEITURA')
    expect(post.json().error.message).toContain('só para consulta')
    expect((await pedir('POST', '/teste/sem-escrita')).statusCode).toBe(200)
  })

  it('bloqueado: só as rotas da assinatura', async () => {
    empresaComAtraso('2026-09-01')
    const res = await pedir('GET', '/teste/protegida')
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('ASSINATURA_BLOQUEADA')
    expect((await pedir('GET', '/teste/livre')).statusCode).toBe(200)
  })

  it('bloqueio manual vale mesmo em dia', async () => {
    empresaComAtraso(null, { bloqueioManual: true })
    expect((await pedir('GET', '/teste/protegida')).json().error.code).toBe('ASSINATURA_BLOQUEADA')
  })

  it('módulo fora do plano: recusado com mensagem clara', async () => {
    empresaComAtraso(null)
    const res = await pedir('GET', '/teste/estoque')
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toMatchObject({ code: 'MODULO_NAO_CONTRATADO', message: 'O módulo Estoque não faz parte do plano Essencial.' })
  })
})
