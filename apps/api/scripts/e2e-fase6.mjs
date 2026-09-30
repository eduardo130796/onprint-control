// Teste ponta a ponta da Fase 6 (financeiro e caixa/PDV) num banco DESCARTÁVEL recém-criado com seed.
// Critério de aceite: quitar as parcelas deixa o pedido "pago" e libera a comissão.
import { io } from 'socket.io-client'
import { BASE, chamar, conferir, entrar, finalizar } from './e2e-util.mjs'

const ORIGEM = BASE.replace('/api/v1', '')
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
const dia = (n) => new Date(Date.parse(`${hoje}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10)
const num = (v) => Number(v)

const admin = await entrar('admin@onprint.local', 'admin123', 'Admin12345')
const matriz = (await chamar('GET', '/permissoes', { token: admin })).json
const papel = (codigo) => matriz.papeis.find((p) => p.codigo === codigo).id
for (const [nome, email, p] of [
  ['Vera Vendedora', 'vera@onprint.local', 'vendedor'],
  ['Fábio Financeiro', 'fabio@onprint.local', 'financeiro'],
  ['Carla Caixa', 'carla@onprint.local', 'caixa'],
]) {
  await chamar('POST', '/usuarios', { token: admin, body: { nome, email, papelId: papel(p), senhaProvisoria: 'provisoria1', comissaoPercentual: '5' } })
}
const vera = await entrar('vera@onprint.local', 'provisoria1', 'Vendedora123')
const fabio = await entrar('fabio@onprint.local', 'provisoria1', 'Financeiro123')
const carla = await entrar('carla@onprint.local', 'provisoria1', 'Caixa12345')

const formas = (await chamar('GET', '/financeiro/formas?pageSize=50', { token: fabio })).json.data
const forma = (tipo) => formas.find((f) => f.tipo === tipo)
const contas = async () => (await chamar('GET', '/financeiro/contas?pageSize=50', { token: fabio })).json.data
const caixaConta = (await contas()).find((c) => c.tipo === 'caixa')
const banco = (await contas()).find((c) => c.tipo === 'banco')

console.log('— Pedido com sinal + 2 parcelas —')
const cat = (await chamar('GET', '/orcamentos/catalogo', { token: vera })).json
const cli = (await chamar('POST', '/clientes', { token: vera, body: { nome: 'Mercado Bom Preço', whatsapp: '11966665555' } })).json
const orc = (await chamar('POST', '/orcamentos', { token: vera, body: { clienteId: cli.id, itens: [{ produtoId: cat.find((p) => p.nome.startsWith('Banner')).id, quantidade: 2, largura: '2', altura: '1' }] } })).json
await chamar('POST', `/orcamentos/${orc.id}/aprovar`, { token: vera, body: { nome: 'Cliente' } })
const pedidoId = (await chamar('POST', `/orcamentos/${orc.id}/converter`, { token: vera, body: { sinalPercentual: '50', parcelas: 2 } })).json.pedidoId
const titulos = (await chamar('GET', `/financeiro/receber?pedidoId=${pedidoId}&sort=vencimento:asc`, { token: fabio })).json
conferir('conversão gerou 3 títulos (categoria Pedidos)', `${titulos.data.length} ${titulos.data[0]?.categoria?.nome}`, '3 Pedidos')
conferir('vendedor não acessa o financeiro', (await chamar('GET', '/financeiro/receber', { token: vera })).status, 403)
const [sinal, p2, p3] = titulos.data
const pedido = async () => (await chamar('GET', `/pedidos/${pedidoId}`, { token: admin })).json
conferir('comissão nasce prevista', (await pedido()).comissoes[0]?.status, 'prevista')

console.log('\n— Baixas: parcial, juros, estorno —')
const baixar = (t, body, token = fabio) => chamar('POST', `/financeiro/receber/${t.id}/baixa`, { token, body: { data: hoje, formaPagamentoId: forma('pix').id, ...body } })
const metade = (num(sinal.valor) / 2).toFixed(2)
let r = await baixar(sinal, { valorRecebido: metade })
conferir('baixa parcial do sinal', `${r.json.status} ${r.json.saldo}`, `parcial ${(num(sinal.valor) - num(metade)).toFixed(2)}`)
conferir('pedido fica "parcial" no financeiro', (await pedido()).statusFinanceiro, 'parcial')
conferir('baixa maior que o saldo é recusada', (await baixar(sinal, { valorRecebido: sinal.valor })).status, 422)
r = await baixar(sinal, { valorRecebido: (num(sinal.valor) - num(metade) + 2).toFixed(2), juros: '2' })
conferir('quita o sinal com R$ 2 de juros (principal não inclui juros)', `${r.json.status} ${r.json.juros} ${r.json.valorPago}`, `pago 2 ${sinal.valor}`)
const pagamento = r.json.movimentos.find((m) => num(m.juros) === 2)
r = await chamar('POST', `/financeiro/receber/${sinal.id}/movimentos/${pagamento.id}/estornar`, { token: fabio, body: { motivo: 'Lançado em dobro' } })
conferir('estorno devolve o saldo e o status', `${r.json.status} ${r.json.juros}`, 'parcial 0')
conferir('estorno do mesmo pagamento duas vezes é recusado', (await chamar('POST', `/financeiro/receber/${sinal.id}/movimentos/${pagamento.id}/estornar`, { token: fabio, body: { motivo: 'de novo' } })).status, 422)
await baixar(sinal, { valorRecebido: (num(sinal.valor) - num(metade)).toFixed(2) })

console.log('\n— Taxa de cartão —')
r = await baixar(p2, { valorRecebido: p2.valor, formaPagamentoId: forma('cartao_credito').id })
const taxas = (await chamar('GET', '/financeiro/movimentos?busca=Taxa', { token: fabio })).json.data
conferir('cartão de crédito gera despesa de taxa (3,5%)', taxas[0]?.valor, (num(p2.valor) * 0.035).toFixed(2).replace(/\.?0+$/, ''))

console.log('\n— CRITÉRIO DE ACEITE: quitar tudo → pedido pago + comissão liberada —')
const socket = await new Promise((resolve, reject) => {
  const s = io(ORIGEM, { path: '/socket.io', auth: { token: vera }, transports: ['websocket'] })
  s.on('connect', () => resolve(s))
  s.on('connect_error', reject)
})
const avisos = []
socket.on('notificacao:nova', (e) => avisos.push(e))
await espera(300)
conferir('antes da última parcela: comissão ainda prevista', (await pedido()).comissoes[0]?.status, 'prevista')
await baixar(p3, { valorRecebido: p3.valor })
const pago = await pedido()
conferir('PEDIDO FICOU "PAGO"', `${pago.statusFinanceiro} ${pago.valorPago}`, `pago ${pago.total}`)
conferir('COMISSÃO LIBERADA', pago.comissoes[0]?.status, 'liberada')
await espera(400)
conferir('vendedora avisada em tempo real', avisos.some((a) => a.titulo === 'Comissão liberada'), true)
socket.close()
const comissao = (await chamar('GET', '/financeiro/comissoes?status=liberada', { token: fabio })).json.data[0]
r = await chamar('POST', '/financeiro/comissoes/pagar', { token: fabio, body: { ids: [comissao.id], contaFinanceiraId: banco.id, data: hoje } })
conferir('comissão paga vira saída no financeiro', `${r.status} ${(await chamar('GET', '/financeiro/comissoes?status=paga', { token: fabio })).json.data.length}`, '200 1')
conferir('comissão prevista (não liberada) não pode ser paga', (await chamar('POST', '/financeiro/comissoes/pagar', { token: fabio, body: { ids: [comissao.id], contaFinanceiraId: banco.id, data: hoje } })).status, 422)

console.log('\n— Contas a pagar —')
const forn = (await chamar('POST', '/fornecedores', { token: admin, body: { nome: 'Distribuidora de Lonas' } })).json
r = await chamar('POST', '/financeiro/pagar', { token: fabio, body: { fornecedorId: forn.id, descricao: 'Compra de lona', documento: 'NF 1234', valor: '300', vencimento: dia(10), parcelas: 3 } })
conferir('conta a pagar em 3 parcelas', `${r.status} ${r.json.map((t) => t.valor).join('+')}`, '201 100+100+100')
const [cp1, cp2] = r.json
conferir('paga a 1ª parcela', (await chamar('POST', `/financeiro/pagar/${cp1.id}/baixa`, { token: fabio, body: { valorRecebido: '100', data: hoje, formaPagamentoId: forma('boleto').id } })).json.status, 'pago')
conferir('cancelar título com pagamento é recusado', (await chamar('POST', `/financeiro/pagar/${cp1.id}/cancelar`, { token: fabio, body: { motivo: 'erro' } })).status, 422)
conferir('cancela a 2ª parcela (sem pagamento)', (await chamar('POST', `/financeiro/pagar/${cp2.id}/cancelar`, { token: fabio, body: { motivo: 'Renegociado' } })).json.status, 'cancelado')
const vencida = (await chamar('POST', '/financeiro/pagar', { token: fabio, body: { descricao: 'Energia', valor: '180', vencimento: dia(-2) } })).json[0]
conferir('título com vencimento passado nasce vencido', vencida.status, 'vencido')

console.log('\n— Fluxo de caixa e calendário —')
const fluxo = (await chamar('GET', `/financeiro/fluxo?de=${hoje}&ate=${dia(90)}`, { token: fabio })).json
conferir('fluxo: realizado de hoje confere com as entradas', num(fluxo.totais.entradas) > 0 && fluxo.dias[0].data === hoje, true)
conferir('fluxo: saídas previstas incluem as contas a pagar', num(fluxo.totais.previstoSaidas), 280)
conferir('calendário do mês responde', (await chamar('GET', `/financeiro/calendario?mes=${hoje.slice(0, 7)}`, { token: fabio })).status, 200)

console.log('\n— Caixa / PDV —')
const caneta = (await chamar('POST', '/produtos', { token: admin, body: { nome: 'Caneta personalizada', tipo: 'revenda', modoCalculo: 'unidade', precoVenda: '5', custo: '2', controlaEstoque: true, estoqueMinimo: '2' } })).json
const almox = (await chamar('GET', '/estoque/locais', { token: admin })).json.find((l) => l.padrao)
await chamar('POST', '/estoque/entradas', { token: admin, body: { localId: almox.id, dataEntrada: hoje, itens: [{ produtoId: caneta.id, quantidade: '10', custoUnitario: '2' }] } })
conferir('sem caixa aberto não vende', (await chamar('POST', '/caixa/vendas', { token: carla, body: { itens: [{ produtoId: caneta.id, quantidade: '1' }], pagamentos: [{ formaPagamentoId: forma('dinheiro').id, valor: '5' }] } })).status, 422)
r = await chamar('POST', '/caixa/abrir', { token: carla, body: { valorAbertura: '100' } })
conferir('caixa aberto com R$ 100 de troco', `${r.status} ${r.json.dinheiroEsperado}`, '201 100.00')
conferir('grade do PDV mostra saldo', (await chamar('GET', '/caixa/produtos?busca=Caneta', { token: carla })).json[0]?.saldo, '10.000')
const vender = (body) => chamar('POST', '/caixa/vendas', { token: carla, body })
r = await vender({ itens: [{ produtoId: caneta.id, quantidade: '4' }], desconto: '1', pagamentos: [{ formaPagamentoId: forma('dinheiro').id, valor: '50' }] })
conferir('venda de R$ 19 com troco de R$ 31', `${r.status} ${r.json.total} ${r.json.troco}`, '201 19 31')
const venda1 = r.json
conferir('pagamento a menor é recusado', (await vender({ itens: [{ produtoId: caneta.id, quantidade: '1' }], pagamentos: [{ formaPagamentoId: forma('pix').id, valor: '2' }] })).status, 422)
conferir('troco sem dinheiro é recusado', (await vender({ itens: [{ produtoId: caneta.id, quantidade: '1' }], pagamentos: [{ formaPagamentoId: forma('pix').id, valor: '10' }] })).status, 422)
r = await vender({ itens: [{ produtoId: caneta.id, quantidade: '2' }], pagamentos: [{ formaPagamentoId: forma('cartao_debito').id, valor: '6' }, { formaPagamentoId: forma('dinheiro').id, valor: '4' }] })
conferir('venda com duas formas', r.status, 201)
const saldoCaneta = async () => (await chamar('GET', '/caixa/produtos?busca=Caneta', { token: carla })).json[0]?.saldo
conferir('estoque baixou 4 + 2 canetas', await saldoCaneta(), '4.000')
r = await chamar('POST', `/caixa/vendas/${venda1.id}/cancelar`, { token: carla, body: { motivo: 'Cliente desistiu' } })
conferir('venda cancelada devolve o estoque', `${r.json.status} ${await saldoCaneta()}`, 'cancelada 8.000')
let atual = (await chamar('GET', '/caixa/atual', { token: carla })).json
conferir('gaveta: 100 + 4 (dinheiro) após o cancelamento', atual.dinheiroEsperado, '104.00')

const receber = (await chamar('POST', '/financeiro/receber', { token: fabio, body: { clienteId: cli.id, descricao: 'Serviço avulso', valor: '80', vencimento: hoje } })).json[0]
conferir('caixa encontra o título em aberto', (await chamar('GET', '/caixa/titulos?busca=Serviço', { token: carla })).json.some((t) => t.id === receber.id), true)
atual = (await chamar('POST', '/caixa/recebimentos', { token: carla, body: { contaReceberId: receber.id, valorRecebido: '80', formaPagamentoId: forma('dinheiro').id } })).json
conferir('recebimento no caixa entra na gaveta', atual.dinheiroEsperado, '184.00')
conferir('título recebido no caixa fica pago', (await chamar('GET', `/financeiro/receber/${receber.id}`, { token: fabio })).json.status, 'pago')
conferir('sangria maior que o dinheiro é recusada', (await chamar('POST', '/caixa/movimentos', { token: carla, body: { tipo: 'sangria', valor: '500', motivo: 'Depósito' } })).status, 422)
atual = (await chamar('POST', '/caixa/movimentos', { token: carla, body: { tipo: 'sangria', valor: '150', motivo: 'Depósito no banco' } })).json
conferir('sangria com motivo', atual.dinheiroEsperado, '34.00')
const debito = atual.porForma.find((p) => p.tipo === 'cartao_debito')
r = await chamar('POST', `/caixa/sessoes/${atual.id}/fechar`, {
  token: carla,
  body: { informados: [{ formaPagamentoId: forma('dinheiro').id, valor: '32' }, { formaPagamentoId: debito.formaPagamentoId, valor: debito.calculado }] },
})
conferir('fechamento com falta de R$ 2 no dinheiro', `${r.json.status} ${r.json.diferenca}`, 'fechada -2')
conferir('com o caixa fechado não vende', (await vender({ itens: [{ produtoId: caneta.id, quantidade: '1' }], pagamentos: [{ formaPagamentoId: forma('dinheiro').id, valor: '5' }] })).status, 422)
const caixaDepois = (await contas()).find((c) => c.id === caixaConta.id)
// Conta caixa: vendas em dinheiro (4) + recebimento (80) − sangria (150) − falta (2)
conferir('saldo da conta Caixa acompanha o dinheiro', caixaDepois.saldoAtual, (4 + 80 - 150 - 2).toFixed(2))
conferir('histórico de sessões', (await chamar('GET', '/caixa/sessoes', { token: carla })).json.meta.total, 1)

finalizar()
