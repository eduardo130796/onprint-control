import { describe, expect, it } from 'vitest'
import { linkVitrineSchema, normalizarSlugEmpresa, slugEmpresaSchema } from './vitrine'

describe('link da vitrine: normalização', () => {
  it('tira acento, pontuação e espaços; minúsculo com hífen', () => {
    expect(normalizarSlugEmpresa('Gráfica São João Ltda.')).toBe('grafica-sao-joao-ltda')
    expect(normalizarSlugEmpresa('  Ponto   Visual!!  ')).toBe('ponto-visual')
    expect(normalizarSlugEmpresa('***')).toBe('')
  })
  it('corta em 40 letras sem deixar hífen no fim', () => {
    expect(normalizarSlugEmpresa('a'.repeat(60))).toHaveLength(40)
    expect(normalizarSlugEmpresa(`${'a'.repeat(39)} b`)).toBe('a'.repeat(39))
  })
  it('digitando mantém o hífen do fim', () => {
    expect(normalizarSlugEmpresa('Ponto ', { digitando: true })).toBe('ponto-')
    expect(normalizarSlugEmpresa('-Ponto--Visual', { digitando: true })).toBe('ponto-visual')
  })
})

describe('link da vitrine: validação', () => {
  const valido = (s: string) => slugEmpresaSchema.safeParse(s).success
  it('aceita letras, números e hífen entre 3 e 40', () => {
    for (const s of ['abc', 'ponto-visual', 'grafica-2', '123', 'a'.repeat(40)]) expect(valido(s)).toBe(true)
  })
  it('recusa tamanho, caracteres e hífens fora do lugar', () => {
    for (const s of ['ab', 'a'.repeat(41), '-ponto', 'ponto-', 'ponto--visual', 'ponto visual', 'gráfica', 'ponto_visual', 'ponto.visual']) expect(valido(s)).toBe(false)
  })
  it('recusa subdomínios reservados', () => {
    const r = slugEmpresaSchema.safeParse('admin')
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toContain('reservado')
    expect(valido('www')).toBe(false)
  })
  it('aceita maiúsculas e espaços nas pontas (normaliza)', () => {
    expect(linkVitrineSchema.parse({ slug: '  Ponto-Visual ' })).toEqual({ slug: 'ponto-visual' })
  })
})
