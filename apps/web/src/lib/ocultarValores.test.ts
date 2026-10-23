import { describe, expect, it } from 'vitest'
import { rotaFinanceira, temValorEmDinheiro } from './ocultarValores'

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
  it('só faturamento: painel, financeiro, caixa e relatórios', () => {
    for (const r of ['/', '/financeiro/receber', '/financeiro', '/caixa', '/caixa/pdv', '/relatorios/vendas']) expect(rotaFinanceira(r)).toBe(true)
    for (const r of ['/orcamentos', '/pedidos/1', '/produtos', '/clientes/1', '/financeiros', '/caixas']) expect(rotaFinanceira(r)).toBe(false)
  })
})
