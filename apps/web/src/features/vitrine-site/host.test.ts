import { describe, expect, it } from 'vitest'
import { SUBDOMINIOS_RESERVADOS as DO_CONTRATO } from '@onprint/shared'
import { SUBDOMINIOS_RESERVADOS, dominioBaseVitrine, pareceDominioProprio, slugDaVitrine } from './host'

describe('slugDaVitrine', () => {
  it('reconhece {slug}.localhost em desenvolvimento (com ou sem porta)', () => {
    expect(slugDaVitrine('vitrine-cupom.localhost', 'localhost')).toBe('vitrine-cupom')
    expect(slugDaVitrine('vitrine-cupom.localhost:5173', 'localhost')).toBe('vitrine-cupom')
    expect(slugDaVitrine('Grafica1.LOCALHOST', 'localhost')).toBe('grafica1')
  })

  it('reconhece {slug}.{dominio} em produção', () => {
    expect(slugDaVitrine('vitrine-cupom.grafygo.com.br', 'grafygo.com.br')).toBe('vitrine-cupom')
    expect(slugDaVitrine('vitrine-cupom.grafygo.com.br.', 'grafygo.com.br')).toBe('vitrine-cupom')
  })

  it('o próprio domínio, outros domínios e IPs são o sistema', () => {
    expect(slugDaVitrine('localhost', 'localhost')).toBeNull()
    expect(slugDaVitrine('localhost:5173', 'localhost')).toBeNull()
    expect(slugDaVitrine('127.0.0.1', 'localhost')).toBeNull()
    expect(slugDaVitrine('grafygo.com.br', 'grafygo.com.br')).toBeNull()
    expect(slugDaVitrine('loja.outrodominio.com', 'grafygo.com.br')).toBeNull()
    expect(slugDaVitrine('xgrafygo.com.br', 'grafygo.com.br')).toBeNull()
  })

  it('subdomínios reservados nunca são vitrine', () => {
    for (const s of ['www', 'app', 'api', 'admin', 'plataforma', 'painel', 'ajuda', 'cdn', 'assets']) {
      expect(slugDaVitrine(`${s}.grafygo.com.br`, 'grafygo.com.br')).toBeNull()
    }
  })

  it('recusa mais de um nível e slugs inválidos', () => {
    expect(slugDaVitrine('a.b.localhost', 'localhost')).toBeNull()
    expect(slugDaVitrine('-loja.localhost', 'localhost')).toBeNull()
    expect(slugDaVitrine('loja_1.localhost', 'localhost')).toBeNull()
  })
})

describe('dominioBaseVitrine', () => {
  it('usa localhost quando a variável está vazia', () => {
    expect(dominioBaseVitrine(undefined)).toBe('localhost')
    expect(dominioBaseVitrine('  ')).toBe('localhost')
    expect(dominioBaseVitrine('.Grafygo.com.br')).toBe('grafygo.com.br')
  })
})

describe('subdomínios reservados', () => {
  it('a cópia leve do site é igual à do contrato (API recusa os mesmos)', () => {
    expect([...SUBDOMINIOS_RESERVADOS].sort()).toEqual([...DO_CONTRATO].sort())
  })
})

describe('pareceDominioProprio', () => {
  it('outro domínio qualquer pode ser vitrine (a API confirma)', () => {
    expect(pareceDominioProprio('www.graficaboa.com.br', 'grafygo.com.br')).toBe(true)
    expect(pareceDominioProprio('graficaboa.com.br:443', 'grafygo.com.br')).toBe(true)
  })
  it('o sistema, as vitrines da GrafyGo, localhost e IP não consultam a API', () => {
    expect(pareceDominioProprio('app.grafygo.com.br', 'grafygo.com.br')).toBe(false)
    expect(pareceDominioProprio('grafica-x.grafygo.com.br', 'grafygo.com.br')).toBe(false)
    expect(pareceDominioProprio('grafygo.com.br', 'grafygo.com.br')).toBe(false)
    expect(pareceDominioProprio('localhost:5173', 'localhost')).toBe(false)
    expect(pareceDominioProprio('grafica.localhost:5173', 'localhost')).toBe(false)
    expect(pareceDominioProprio('192.168.0.10:5173', 'localhost')).toBe(false)
    expect(pareceDominioProprio('[::1]:5173', 'localhost')).toBe(false)
  })
})
