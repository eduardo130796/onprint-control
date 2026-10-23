import { describe, expect, it } from 'vitest'
import { OCULTAR_VALORES_PADRAO, OCULTAR_VALORES_TUDO, type OcultarValoresPrefs } from '@onprint/shared'
import { areaDaRota, deveOcultar, temValorEmDinheiro } from './ocultarValores'

const com = (p: Partial<OcultarValoresPrefs>) => ({ ...OCULTAR_VALORES_PADRAO, ...p })

describe('ocultar valores', () => {
  it('borra valores em dinheiro e rótulos curtos com valor', () => {
    expect(temValorEmDinheiro('R$ 1.234,56')).toBe(true)
    expect(temValorEmDinheiro('R$ 900,00')).toBe(true)
    expect(temValorEmDinheiro('Total: R$ 900,00')).toBe(true)
    expect(temValorEmDinheiro('R$ -10,00')).toBe(true)
    expect(temValorEmDinheiro('R$ 2 mil')).toBe(true)
  })
  it('não borra o que não é dinheiro nem blocos grandes da página', () => {
    expect(temValorEmDinheiro('Lucro de 61,5%')).toBe(false)
    expect(temValorEmDinheiro('PED-2026-0064')).toBe(false)
    expect(temValorEmDinheiro('R$')).toBe(false)
    expect(temValorEmDinheiro(`Resumo do mês com muitos números e texto ${'x'.repeat(80)} R$ 10,00`)).toBe(false)
  })
  it('área de cada tela pela rota', () => {
    expect(areaDaRota('/')).toBe('painel')
    for (const r of ['/financeiro/receber', '/financeiro', '/caixa', '/caixa/pdv', '/relatorios/vendas']) expect(areaDaRota(r)).toBe('financeiro')
    for (const r of ['/orcamentos', '/orcamentos/kanban', '/orcamentos/solicitacoes', '/orcamentos/1']) expect(areaDaRota(r)).toBe('orcamentos')
    for (const r of ['/pedidos', '/pedidos/1', '/producao', '/producao/ordens/1', '/vitrine/pedidos']) expect(areaDaRota(r)).toBe('pedidos')
    for (const r of ['/produtos', '/produtos/insumos/1', '/produtos/acabamentos', '/estoque', '/vitrine/produtos']) expect(areaDaRota(r)).toBe('produtos')
    for (const r of ['/clientes/1', '/financeiros', '/caixas', '/orcamentoss', '/configuracoes/aparencia', '/vitrine']) expect(areaDaRota(r)).toBeNull()
  })
  it('padrão: só o faturamento (painel, financeiro e abas financeiras)', () => {
    const prefs = OCULTAR_VALORES_PADRAO
    expect(deveOcultar({ rota: '/', prefs })).toBe(true)
    expect(deveOcultar({ rota: '/financeiro/receber', prefs })).toBe(true)
    expect(deveOcultar({ rota: '/orcamentos/1', tipo: 'total', prefs })).toBe(false)
    expect(deveOcultar({ rota: '/pedidos/1', prefs })).toBe(false)
    expect(deveOcultar({ rota: '/produtos/1', prefs })).toBe(false)
    expect(deveOcultar({ rota: '/orcamentos/1', tipo: 'custo', prefs })).toBe(false)
    expect(deveOcultar({ rota: '/clientes/1', dentroFinanceiro: true, prefs })).toBe(true)
  })
  it('orçamentos "totais": só o valor final; "tudo": qualquer valor', () => {
    const totais = com({ orcamentos: 'totais' })
    expect(deveOcultar({ rota: '/orcamentos/1', tipo: 'total', prefs: totais })).toBe(true)
    expect(deveOcultar({ rota: '/orcamentos/kanban', tipo: 'total', prefs: totais })).toBe(true)
    expect(deveOcultar({ rota: '/orcamentos/1', prefs: totais })).toBe(false)
    expect(deveOcultar({ rota: '/pedidos/1', tipo: 'total', prefs: totais })).toBe(false)
    const tudo = com({ orcamentos: 'tudo' })
    expect(deveOcultar({ rota: '/orcamentos/1', prefs: tudo })).toBe(true)
    expect(deveOcultar({ rota: '/orcamentos/1', tipo: 'total', prefs: tudo })).toBe(true)
  })
  it('lista de outra área dentro de uma tela segue a área marcada', () => {
    const prefs = com({ orcamentos: 'totais' })
    expect(deveOcultar({ rota: '/clientes/1', area: 'orcamentos', tipo: 'total', prefs })).toBe(true)
    expect(deveOcultar({ rota: '/clientes/1', area: 'orcamentos', prefs })).toBe(false)
    expect(deveOcultar({ rota: '/clientes/1', area: 'pedidos', tipo: 'total', prefs })).toBe(false)
  })
  it('custo/lucro/margem vale em qualquer tela', () => {
    const prefs = com({ custoLucro: true })
    for (const rota of ['/orcamentos/1', '/produtos/1', '/clientes/1', '/relatorios/lucratividade']) expect(deveOcultar({ rota, tipo: 'custo', prefs })).toBe(true)
    expect(deveOcultar({ rota: '/orcamentos/1', prefs })).toBe(false)
  })
  it('aba financeira dentro do pedido segue "financeiro", mesmo com pedidos "nada"', () => {
    expect(deveOcultar({ rota: '/pedidos/1', dentroFinanceiro: true, prefs: com({ pedidos: 'nada' }) })).toBe(true)
    expect(deveOcultar({ rota: '/pedidos/1', dentroFinanceiro: true, prefs: com({ financeiro: false }) })).toBe(false)
  })
  it('desligando painel e financeiro, nada do faturamento some; tudo ligado esconde todas as áreas', () => {
    const nada = com({ painel: false, financeiro: false })
    expect(deveOcultar({ rota: '/', prefs: nada })).toBe(false)
    expect(deveOcultar({ rota: '/caixa', prefs: nada })).toBe(false)
    for (const rota of ['/', '/caixa', '/orcamentos/1', '/pedidos', '/produtos']) expect(deveOcultar({ rota, prefs: OCULTAR_VALORES_TUDO })).toBe(true)
    expect(deveOcultar({ rota: '/clientes/1', prefs: OCULTAR_VALORES_TUDO })).toBe(false)
  })
})
