import { describe, expect, it } from 'vitest'
import { navegacao, paginaAtual, paginas } from './navigation'

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
})
