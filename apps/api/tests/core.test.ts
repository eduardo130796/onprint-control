import { describe, expect, it } from 'vitest'
import { duracaoEmMs } from '../src/core/duracao'
import { SCHEMA_PLATAFORMA, schemaValido, urlDoSchema } from '../src/core/banco'
import { empresaDoRefreshToken, gerarRefreshToken, hashRefreshToken } from '../src/core/tokens'
import { gerarSlug } from '../src/plataforma/provisionar'
import { carregarEnv } from '../src/config/env'

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
  it('aceita segredos de exemplo fora de produção', () => {
    expect(carregarEnv(base).NODE_ENV).toBe('development')
  })
  it('recusa segredos fracos ou iguais em produção', () => {
    expect(() => carregarEnv({ ...base, NODE_ENV: 'production' })).toThrow(/JWT_ACCESS_SECRET/)
    const forte = 'a'.repeat(40)
    expect(() => carregarEnv({ ...base, NODE_ENV: 'production', JWT_ACCESS_SECRET: forte, JWT_REFRESH_SECRET: forte })).toThrow(/diferente/)
    expect(carregarEnv({ ...base, NODE_ENV: 'production', JWT_ACCESS_SECRET: forte, JWT_REFRESH_SECRET: 'b'.repeat(40) }).NODE_ENV).toBe('production')
  })
})
