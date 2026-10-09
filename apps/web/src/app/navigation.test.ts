import { describe, expect, it } from 'vitest'
import { agruparPorSecao, filtrarNavegacao, navegacao, paginaAtual, paginas, podeAbrir } from './navigation'

describe('navegação', () => {
  it('não tem rotas duplicadas', () => {
    const caminhos = paginas.map((p) => p.path)
    expect(new Set(caminhos).size).toBe(caminhos.length)
  })

  it('inclui todos os módulos do menu', () => {
    const titulos = navegacao.map((m) => m.titulo)
    for (const t of ['Início', 'Orçamentos', 'Produção', 'Estoque', 'Financeiro', 'Caixa / PDV', 'Configurações']) {
      expect(titulos).toContain(t)
    }
  })

  it('resolve a página atual, inclusive sub-rotas de cadastro', () => {
    expect(paginaAtual('/clientes')?.titulo).toBe('Clientes')
    expect(paginaAtual('/clientes/novo')?.path).toBe('/clientes')
    expect(paginaAtual('/produtos/acabamentos/novo')?.titulo).toBe('Acabamentos')
    expect(paginaAtual('/')?.titulo).toBe('Início')
  })

  it('não repete telas no menu e deixa as abas (kanban, entregas…) fora dele, mas com rota', () => {
    const menu = filtrarNavegacao(() => true)
    const destinos = menu.flatMap((m) => (m.filhos ? m.filhos.map((f) => f.path) : [m.path]))
    expect(new Set(destinos).size).toBe(destinos.length)
    const titulos = menu.flatMap((m) => (m.filhos ? m.filhos.map((f) => `${m.titulo}/${f.titulo}`) : [m.titulo]))
    expect(new Set(titulos).size).toBe(titulos.length)
    for (const aba of ['/orcamentos/kanban', '/pedidos/kanban', '/pedidos/entregas', '/producao/ordens', '/estoque/alertas', '/configuracoes/maquinas', '/configuracoes/whatsapp']) {
      expect(paginas.map((p) => p.path)).toContain(aba)
    }
    expect(destinos).not.toContain('/orcamentos/kanban')
    expect(destinos).not.toContain('/configuracoes/maquinas')
    // Grupo só de abas vira link direto para a tela principal, com as abas para marcar ativo
    const pedidos = menu.find((m) => m.modulo === 'pedidos')!
    expect(pedidos.filhos).toBeUndefined()
    expect(pedidos.path).toBe('/pedidos')
    expect(pedidos.abas?.map((a) => a.path)).toContain('/pedidos/entregas')
  })

  it('agrupa o menu em seções na ordem, sem seções vazias', () => {
    const secoes = agruparPorSecao(filtrarNavegacao(() => true)).map((s) => s.secao)
    expect(secoes).toEqual(['inicio', 'comercial', 'operacao', 'gestao'])
    const soClientes = agruparPorSecao(filtrarNavegacao(((m: string) => m === 'clientes') as never))
    expect(soClientes.map((s) => s.secao)).toEqual(['comercial'])
  })

  it('exige editar no reajuste de preços', () => {
    const produtos = filtrarNavegacao(((m: string, a?: string) => m === 'produtos' && a !== 'editar') as never).find((m) => m.modulo === 'produtos')
    expect(produtos?.filhos?.map((f) => f.path)).toContain('/produtos/insumos')
    expect(produtos?.filhos?.map((f) => f.path)).not.toContain('/produtos/reajuste')
    expect(paginaAtual('/produtos/insumos/novo')?.titulo).toBe('Insumos e materiais')
  })

  it('mostra Lucratividade só para quem vê relatórios E custos (produtos:editar)', () => {
    const relatorios = (pode: (m: string, a?: string) => boolean) => filtrarNavegacao(pode as never).find((m) => m.modulo === 'relatorios')?.filhos?.map((f) => f.path) ?? []
    expect(relatorios(() => true)).toContain('/relatorios/lucratividade')
    expect(relatorios((m, a) => m === 'relatorios' || (m === 'produtos' && a !== 'editar'))).not.toContain('/relatorios/lucratividade')
    expect(relatorios((m, a) => m === 'relatorios' || (m === 'produtos' && a !== 'editar'))).toContain('/relatorios/vendas')
    const pagina = paginas.find((p) => p.path === '/relatorios/lucratividade')!
    expect(podeAbrir(((m: string) => m === 'produtos') as never, pagina)).toBe(false)
    expect(podeAbrir((() => true) as never, pagina)).toBe(true)
  })
})
