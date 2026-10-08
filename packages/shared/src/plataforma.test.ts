import { describe, expect, it } from 'vitest'
import { categoriaEmpresa, resumirIndicadores } from './plataforma'

describe('categoriaEmpresa', () => {
  it('uma categoria por empresa', () => {
    expect(categoriaEmpresa('ativa', { nivel: 'normal', motivo: 'em_dia' })).toBe('em_dia')
    expect(categoriaEmpresa('ativa', { nivel: 'normal', motivo: 'liberacao_manual' })).toBe('em_dia')
    expect(categoriaEmpresa('teste', { nivel: 'normal', motivo: 'teste' })).toBe('teste')
    expect(categoriaEmpresa('teste', { nivel: 'aviso', motivo: 'teste_acabando' })).toBe('teste')
    expect(categoriaEmpresa('teste', { nivel: 'aviso', motivo: 'teste_expirado' })).toBe('aviso')
    expect(categoriaEmpresa('ativa', { nivel: 'aviso', motivo: 'atraso' })).toBe('aviso')
    expect(categoriaEmpresa('ativa', { nivel: 'somente_leitura', motivo: 'atraso' })).toBe('somente_leitura')
    expect(categoriaEmpresa('ativa', { nivel: 'bloqueado', motivo: 'bloqueio_manual' })).toBe('bloqueada')
    expect(categoriaEmpresa('cancelada', { nivel: 'bloqueado', motivo: 'cancelada' })).toBe('cancelada')
  })
})

describe('resumirIndicadores', () => {
  it('conta por categoria e soma a receita de quem paga em dia; atraso vira receita em risco', () => {
    const r = resumirIndicadores([
      { situacao: 'ativa', acesso: { nivel: 'normal', motivo: 'em_dia' }, valorMensal: '279.00' },
      { situacao: 'ativa', acesso: { nivel: 'normal', motivo: 'em_dia' }, valorMensal: '149.90' },
      { situacao: 'ativa', acesso: { nivel: 'aviso', motivo: 'atraso' }, valorMensal: '449.00' },
      { situacao: 'ativa', acesso: { nivel: 'bloqueado', motivo: 'atraso' }, valorMensal: '149.00' },
      { situacao: 'teste', acesso: { nivel: 'normal', motivo: 'teste' }, valorMensal: '279.00' },
      { situacao: 'cancelada', acesso: { nivel: 'bloqueado', motivo: 'cancelada' }, valorMensal: '279.00' },
    ])
    expect(r.total).toBe(6)
    expect(r.porCategoria).toEqual({ em_dia: 2, teste: 1, cortesia: 0, aviso: 1, somente_leitura: 0, bloqueada: 1, cancelada: 1 })
    expect(r.receitaMensal).toBe('428.90')
    expect(r.receitaEmRisco).toBe('598.00')
  })
  it('vazio', () => {
    expect(resumirIndicadores([])).toMatchObject({ total: 0, receitaMensal: '0.00' })
  })
})
