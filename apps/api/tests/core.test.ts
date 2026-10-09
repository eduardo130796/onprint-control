import { describe, expect, it } from 'vitest'
import { duracaoEmMs } from '../src/core/duracao'
import { SCHEMA_PLATAFORMA, schemaValido, urlDoSchema } from '../src/core/banco'
import { empresaDoRefreshToken, gerarRefreshToken, hashRefreshToken, ocultarTokensDaUrl } from '../src/core/tokens'
import { gerarSlug } from '../src/plataforma/provisionar'
import { carregarEnv } from '../src/config/env'
import { criarContadorTentativas } from '../src/modules/auth/tentativas'

describe('duracaoEmMs', () => {
  it('converte unidades', () => {
    expect(duracaoEmMs('15m')).toBe(900_000)
    expect(duracaoEmMs('7d')).toBe(604_800_000)
  })
  it('rejeita formato inválido', () => {
    expect(() => duracaoEmMs('7 dias')).toThrow()
  })
})

describe('refresh token', () => {
  it('gera tokens distintos e hash determinístico por segredo', () => {
    const a = gerarRefreshToken('emp-1')
    expect(a).not.toBe(gerarRefreshToken('emp-1'))
    expect(hashRefreshToken(a, 'segredo-1')).toBe(hashRefreshToken(a, 'segredo-1'))
    expect(hashRefreshToken(a, 'segredo-1')).not.toBe(hashRefreshToken(a, 'segredo-2'))
  })
  it('carrega a empresa da sessão', () => {
    expect(empresaDoRefreshToken(gerarRefreshToken('3f1c0a7e-0000-4000-8000-000000000001'))).toBe('3f1c0a7e-0000-4000-8000-000000000001')
    expect(empresaDoRefreshToken('token-antigo-sem-empresa')).toBeUndefined()
    // Prefixo que não é UUID (cookie forjado) não chega ao banco
    expect(empresaDoRefreshToken('lixo.abc')).toBeUndefined()
    expect(empresaDoRefreshToken("x' OR 1=1.abc")).toBeUndefined()
  })
})

describe('multiempresa: schemas e slugs', () => {
  it('só aceita nomes de schema seguros para SQL', () => {
    expect(schemaValido('emp_a1b2c3')).toBe(true)
    expect(schemaValido(SCHEMA_PLATAFORMA)).toBe(true)
    for (const ruim of ['', 'Emp', '1emp', 'emp-x', 'emp"; DROP SCHEMA public;--', 'a'.repeat(64)]) expect(schemaValido(ruim)).toBe(false)
  })
  it('monta a URL do schema sem perder os parâmetros existentes', () => {
    const url = new URL(urlDoSchema('postgresql://u:s@db:5432/onprint?sslmode=disable', 'emp_x', 3))
    expect(url.searchParams.get('schema')).toBe('emp_x')
    expect(url.searchParams.get('connection_limit')).toBe('3')
    expect(url.searchParams.get('sslmode')).toBe('disable')
    expect(() => urlDoSchema('postgresql://u:s@db:5432/onprint', 'x; drop')).toThrow()
  })
  it('gera slug a partir do nome da empresa', () => {
    expect(gerarSlug('Gráfica São João Ltda.')).toBe('grafica-sao-joao-ltda')
    expect(gerarSlug('  ***  ')).toBe('empresa')
    expect(gerarSlug('A'.repeat(60)).length).toBe(40)
  })
})

describe('carregarEnv', () => {
  it('falha com mensagem clara quando faltam variáveis', () => {
    expect(() => carregarEnv({})).toThrow(/DATABASE_URL/)
  })

  const base = { DATABASE_URL: 'postgresql://u:s@db:5432/x', JWT_ACCESS_SECRET: 'troque-isto', JWT_REFRESH_SECRET: 'troque-isto-tambem' }
  it('aceita segredos de exemplo só nos testes automatizados', () => {
    expect(carregarEnv({ ...base, NODE_ENV: 'test' }).NODE_ENV).toBe('test')
  })
  it('recusa segredos fracos, de exemplo ou iguais em desenvolvimento e produção', () => {
    expect(() => carregarEnv(base)).toThrow(/JWT_ACCESS_SECRET/)
    expect(() => carregarEnv({ ...base, NODE_ENV: 'production' })).toThrow(/JWT_ACCESS_SECRET/)
    const forte = 'a'.repeat(40)
    expect(() => carregarEnv({ ...base, JWT_ACCESS_SECRET: `TROQUE-${forte}`, JWT_REFRESH_SECRET: 'b'.repeat(40) })).toThrow(/JWT_ACCESS_SECRET/)
    expect(() => carregarEnv({ ...base, NODE_ENV: 'production', JWT_ACCESS_SECRET: forte, JWT_REFRESH_SECRET: forte })).toThrow(/diferente/)
    expect(carregarEnv({ ...base, JWT_ACCESS_SECRET: forte, JWT_REFRESH_SECRET: 'b'.repeat(40) }).NODE_ENV).toBe('development')
    expect(carregarEnv({ ...base, NODE_ENV: 'production', JWT_ACCESS_SECRET: forte, JWT_REFRESH_SECRET: 'b'.repeat(40) }).NODE_ENV).toBe('production')
  })
})

describe('contador de tentativas (login por e-mail)', () => {
  it('trava na 10ª falha por 15 min a partir dela; acerto zera', () => {
    const c = criarContadorTentativas({ max: 10, janelaMs: 15 * 60_000 })
    const t0 = 1_000_000
    for (let i = 0; i < 9; i++) c.registrar('a@b.com', t0 + i)
    expect(c.bloqueado('a@b.com', t0 + 10)).toBe(false)
    c.registrar('a@b.com', t0 + 10 * 60_000)
    expect(c.bloqueado('a@b.com', t0 + 10 * 60_000)).toBe(true)
    expect(c.bloqueado('a@b.com', t0 + 24 * 60_000)).toBe(true)
    expect(c.bloqueado('a@b.com', t0 + 26 * 60_000)).toBe(false)
    expect(c.bloqueado('outro@b.com', t0)).toBe(false)
    c.registrar('x@b.com', t0)
    c.limpar('x@b.com')
    expect(c.bloqueado('x@b.com', t0)).toBe(false)
  })

  it('tem teto de chaves na memória', () => {
    const c = criarContadorTentativas({ max: 1, janelaMs: 60_000, maxChaves: 2 })
    for (const k of ['a', 'b', 'c']) c.registrar(k, 0)
    expect(c.bloqueado('a', 0)).toBe(false)
    expect(c.bloqueado('c', 0)).toBe(true)
  })
})

describe('log sem tokens', () => {
  it('esconde o token do link de senha na URL', () => {
    expect(ocultarTokensDaUrl('/api/v1/auth/redefinir-senha/abc123XYZ')).toBe('/api/v1/auth/redefinir-senha/***')
    expect(ocultarTokensDaUrl('/api/v1/auth/redefinir-senha/abc?x=1')).toBe('/api/v1/auth/redefinir-senha/***?x=1')
    expect(ocultarTokensDaUrl('/api/v1/clientes')).toBe('/api/v1/clientes')
  })
})
