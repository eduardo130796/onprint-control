import { describe, expect, it } from 'vitest'
import { aplicarBaixa, calcularVendaPdv, distribuirValor, saldoPedido, statusFinanceiroPedido, statusTitulo, taxaDaForma } from './financeiro'

describe('aplicarBaixa', () => {
  it('baixa total quita o título', () => {
    expect(aplicarBaixa({ valor: '240', valorPago: '0' }, { valorRecebido: '240' })).toEqual({ ok: true, principal: '240.00', valorPago: '240.00', saldo: '0.00', quitado: true })
  })

  it('baixa parcial abate só o principal', () => {
    const r = aplicarBaixa({ valor: '240', valorPago: '0' }, { valorRecebido: '100' })
    expect(r).toMatchObject({ ok: true, principal: '100.00', saldo: '140.00', quitado: false })
  })

  it('juros e multa não abatem o título; desconto abate', () => {
    // recebeu 150 com 5 de juros e 3 de multa → principal 142
    expect(aplicarBaixa({ valor: '142', valorPago: '0' }, { valorRecebido: '150', juros: '5', multa: '3' })).toMatchObject({ ok: true, principal: '142.00', quitado: true })
    // recebeu 90 com 10 de desconto → quitou 100
    expect(aplicarBaixa({ valor: '100', valorPago: '0' }, { valorRecebido: '90', desconto: '10' })).toMatchObject({ ok: true, principal: '100.00', quitado: true })
  })

  it('recusa valor acima do saldo, zerado ou título quitado', () => {
    expect(aplicarBaixa({ valor: '100', valorPago: '60' }, { valorRecebido: '50' }).ok).toBe(false)
    expect(aplicarBaixa({ valor: '100', valorPago: '0' }, { valorRecebido: '5', juros: '5' }).ok).toBe(false)
    expect(aplicarBaixa({ valor: '100', valorPago: '100' }, { valorRecebido: '1' }).ok).toBe(false)
  })
})

describe('statusTitulo', () => {
  it('pago, parcial, vencido e aberto', () => {
    expect(statusTitulo('100', '100', '2026-09-01', '2026-09-30')).toBe('pago')
    expect(statusTitulo('100', '40', '2026-09-01', '2026-09-30')).toBe('parcial')
    expect(statusTitulo('100', '0', '2026-09-29', '2026-09-30')).toBe('vencido')
    expect(statusTitulo('100', '0', '2026-09-30', '2026-09-30')).toBe('aberto')
  })
})

describe('statusFinanceiroPedido', () => {
  it('ignora cancelados; pago só com tudo quitado', () => {
    expect(statusFinanceiroPedido([{ valor: '120', valorPago: '120', status: 'pago' }, { valor: '120', valorPago: '0', status: 'aberto' }])).toBe('parcial')
    expect(statusFinanceiroPedido([{ valor: '120', valorPago: '120', status: 'pago' }, { valor: '120', valorPago: '120', status: 'pago' }])).toBe('pago')
    expect(statusFinanceiroPedido([{ valor: '120', valorPago: '0', status: 'aberto' }, { valor: '50', valorPago: '0', status: 'cancelado' }])).toBe('pendente')
  })
})

describe('calcularVendaPdv', () => {
  const itens = [{ quantidade: '2', precoUnitario: '25' }, { quantidade: '1', precoUnitario: '10.5' }]

  it('troco em dinheiro', () => {
    expect(calcularVendaPdv(itens, '0.5', [{ valor: '100', dinheiro: true }])).toEqual({ ok: true, subtotal: '60.50', desconto: '0.50', total: '60.00', recebido: '100.00', troco: '40.00' })
  })

  it('várias formas sem troco', () => {
    expect(calcularVendaPdv(itens, '0', [{ valor: '40', dinheiro: false }, { valor: '20.5', dinheiro: true }])).toMatchObject({ ok: true, troco: '0.00' })
  })

  it('recusa falta de pagamento e troco sem dinheiro', () => {
    expect(calcularVendaPdv(itens, '0', [{ valor: '60', dinheiro: true }])).toMatchObject({ ok: false, erro: 'Falta receber R$ 0,50.' })
    expect(calcularVendaPdv(itens, '0', [{ valor: '70', dinheiro: false }]).ok).toBe(false)
    expect(calcularVendaPdv([], '0', []).ok).toBe(false)
  })
})

describe('taxaDaForma', () => {
  it('percentual com arredondamento', () => {
    expect(taxaDaForma('100', '3.5')).toBe('3.50')
    expect(taxaDaForma('33.33', '1.5')).toBe('0.50')
  })
})

describe('distribuirValor (valor avulso do pedido)', () => {
  const parcelas = [
    { id: 'sinal', saldo: '250.00' },
    { id: 'p2', saldo: '250.00' },
  ]
  it('quita a mais antiga e abate o resto na seguinte', () => {
    expect(distribuirValor(parcelas, '300')).toEqual({ ok: true, partes: [{ id: 'sinal', valor: '250.00' }, { id: 'p2', valor: '50.00' }] })
  })
  it('valor menor que a primeira parcela fica só nela', () => {
    expect(distribuirValor(parcelas, '99.90')).toEqual({ ok: true, partes: [{ id: 'sinal', valor: '99.90' }] })
  })
  it('pula títulos já quitados e quita tudo com o valor exato', () => {
    expect(distribuirValor([{ id: 'a', saldo: 0 }, ...parcelas], '500')).toEqual({ ok: true, partes: [{ id: 'sinal', valor: '250.00' }, { id: 'p2', valor: '250.00' }] })
  })
  it('recusa valor acima do aberto, zerado ou sem parcelas', () => {
    expect(distribuirValor(parcelas, '500.01').ok).toBe(false)
    expect(distribuirValor(parcelas, '0').ok).toBe(false)
    expect(distribuirValor([], '10').ok).toBe(false)
  })
})

describe('saldoPedido (o que falta receber no cartão/lista)', () => {
  it('sem pagamento: falta o total', () => {
    expect(saldoPedido('1000', '0')).toEqual({ pago: '0.00', falta: '1000.00', percentual: 0 })
  })
  it('sinal de 40%: abate do total', () => {
    expect(saldoPedido('1000', '400')).toEqual({ pago: '400.00', falta: '600.00', percentual: 40 })
  })
  it('vários abatimentos com centavos', () => {
    expect(saldoPedido('333.33', '111.11')).toEqual({ pago: '111.11', falta: '222.22', percentual: 33 })
  })
  it('quase quitado não arredonda para 100%', () => {
    expect(saldoPedido('100', '99.99')).toMatchObject({ falta: '0.01', percentual: 99 })
  })
  it('quitado: nada falta', () => {
    expect(saldoPedido('250', '250')).toEqual({ pago: '250.00', falta: '0.00', percentual: 100 })
  })
  it('nunca fica negativo nem passa de 100% (pedido editado para menos)', () => {
    expect(saldoPedido('200', '250')).toEqual({ pago: '250.00', falta: '0.00', percentual: 100 })
  })
  it('pedido de valor zero', () => {
    expect(saldoPedido('0', '0')).toEqual({ pago: '0.00', falta: '0.00', percentual: 0 })
  })
})
