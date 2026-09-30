import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { carregarEnv } from '../src/config/env'

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
  // Rota protegida por `autenticar` registrada só para os testes
  app.get('/teste/protegida', { onRequest: [app.autenticar] }, async () => ({ ok: true }))
  await app.ready()
})

function bearer(dts: boolean) {
  return { authorization: `Bearer ${app.jwt.sign({ sub: 'u1', papelId: 'p1', dts })}` }
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
