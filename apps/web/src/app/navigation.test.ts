import { describe, expect, it } from 'vitest'
import { filtrarNavegacao, navegacao, paginaAtual, paginas } from './navigation'

describe('navegação', () => {
  it('não tem rotas duplicadas', () => {
    const caminhos = paginas.map((p) => p.path)
    expect(new Set(caminhos).size).toBe(caminhos.length)
  })

  it('inclui todos os módulos do menu', () => {
    const titulos = navegacao.map((m) => m.titulo)
    for (const t of ['Dashboard', 'Orçamentos', 'Produção', 'Estoque', 'Financeiro', 'Caixa / PDV', 'Configurações']) {
      expect(titulos).toContain(t)
    }
  })

  it('resolve a página atual, inclusive sub-rotas de cadastro', () => {
    expect(paginaAtual('/clientes')?.titulo).toBe('Clientes')
    expect(paginaAtual('/clientes/novo')?.path).toBe('/clientes')
    expect(paginaAtual('/produtos/acabamentos/novo')?.titulo).toBe('Acabamentos')
    expect(paginaAtual('/')?.titulo).toBe('Dashboard')
  })

  it('mostra o atalho de Insumos no Estoque só com os dois módulos e exige editar no reajuste', () => {
    const estoque = (pode: (m: string, a?: string) => boolean) => filtrarNavegacao(pode as never).find((m) => m.modulo === 'estoque')?.filhos?.map((f) => f.titulo) ?? []
    expect(estoque(() => true)).toContain('Insumos')
    expect(estoque((m) => m !== 'produtos')).not.toContain('Insumos')
    const produtos = filtrarNavegacao(((m: string, a?: string) => m === 'produtos' && a !== 'editar') as never).find((m) => m.modulo === 'produtos')
    expect(produtos?.filhos?.map((f) => f.path)).toContain('/produtos/insumos')
    expect(produtos?.filhos?.map((f) => f.path)).not.toContain('/produtos/reajuste')
    expect(paginaAtual('/produtos/insumos/novo')?.titulo).toBe('Insumos e materiais')
  })
})
