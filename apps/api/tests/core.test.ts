import { describe, expect, it } from 'vitest'
import { duracaoEmMs } from '../src/core/duracao'
import { gerarRefreshToken, hashRefreshToken } from '../src/core/tokens'
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
    const a = gerarRefreshToken()
    expect(a).not.toBe(gerarRefreshToken())
    expect(hashRefreshToken(a, 'segredo-1')).toBe(hashRefreshToken(a, 'segredo-1'))
    expect(hashRefreshToken(a, 'segredo-1')).not.toBe(hashRefreshToken(a, 'segredo-2'))
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
