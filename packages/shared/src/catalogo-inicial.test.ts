import { describe, expect, it } from 'vitest'
import { cadastroLoteSchema, itemDaLinha } from './cadastro-lote'
import { CATALOGO_INICIAL, PERFIS_CATALOGO, linhaDoModelo } from './catalogo-inicial'
import { MODOS_CALCULO } from './enums'

const vazio = { categorias: [], acabamentos: [], produtos: [] }

describe('Catálogo inicial (modelos prontos)', () => {
  it('de 25 a 35 modelos, todos os perfis, ids e nomes únicos', () => {
    expect(CATALOGO_INICIAL.length).toBeGreaterThanOrEqual(25)
    expect(CATALOGO_INICIAL.length).toBeLessThanOrEqual(35)
    for (const perfil of PERFIS_CATALOGO) expect(CATALOGO_INICIAL.filter((m) => m.perfil === perfil).length).toBeGreaterThanOrEqual(6)
    expect(new Set(CATALOGO_INICIAL.map((m) => m.id)).size).toBe(CATALOGO_INICIAL.length)
    expect(new Set(CATALOGO_INICIAL.map((m) => m.nome)).size).toBe(CATALOGO_INICIAL.length)
  })

  it('cada modelo tem modo válido e medidas coerentes (por m² com medida máxima; serviços sem arte)', () => {
    for (const m of CATALOGO_INICIAL) {
      expect(MODOS_CALCULO).toContain(m.modoCalculo)
      if (m.larguraPadrao || m.alturaPadrao) expect(Boolean(m.larguraPadrao && m.alturaPadrao)).toBe(true)
      if (m.tipo === 'servico') expect(m.precisaArte).toBe(false)
    }
    expect(CATALOGO_INICIAL.filter((m) => m.modoCalculo === 'm2').every((m) => m.larguraMaxima || m.id === 'adesivo-rotulo')).toBe(true)
  })

  it('nunca traz preço: a linha nasce com "falta preço" e o POST recusa até a pessoa digitar', () => {
    for (const m of CATALOGO_INICIAL) {
      const l = linhaDoModelo(m, vazio)
      expect(l.precoVenda).toBeNull()
      expect(l.acabamentos.every((a) => a.valor === null)).toBe(true)
      expect(cadastroLoteSchema.safeParse({ itens: [itemDaLinha(l)] }).success).toBe(false)
      expect(cadastroLoteSchema.safeParse({ itens: [itemDaLinha({ ...l, precoVenda: '10.00' })] }).success).toBe(true)
    }
  })

  it('liga categoria e acabamentos do cadastro pelo nome e avisa o produto parecido', () => {
    const atual = {
      categorias: [{ id: '00000000-0000-4000-8000-000000000001', nome: 'comunicação visual' }],
      acabamentos: [{ id: '00000000-0000-4000-8000-000000000002', nome: 'Ilhós a cada 50 cm', tipoCobranca: 'por_perimetro' as const, valor: '2.00' }],
      produtos: [{ id: 'p1', nome: 'Banner lona 440g' }],
    }
    const l = linhaDoModelo(CATALOGO_INICIAL.find((m) => m.id === 'banner')!, atual)
    expect(l.categoriaId).toBe(atual.categorias[0]!.id)
    expect(l.categoriaNova).toBeNull()
    expect(l.acabamentos.find((a) => a.nome.startsWith('Ilhós'))).toMatchObject({ id: atual.acabamentos[0]!.id, valor: '2.00' })
    expect(l.acabamentos.find((a) => a.nome === 'Bainha')).toMatchObject({ id: null, valor: null })
    expect(l.duplicado?.id).toBe('p1')
    // O acabamento novo sem preço não vai no POST; o do cadastro vai
    expect(itemDaLinha({ ...l, precoVenda: '65' }).acabamentos?.map((a) => a.id)).toEqual([atual.acabamentos[0]!.id])
  })
})
