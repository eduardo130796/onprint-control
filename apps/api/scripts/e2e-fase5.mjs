// Teste ponta a ponta da Fase 5 (estoque) num banco DESCARTÁVEL recém-criado com seed.
// Critério de aceite: concluir uma OP de banner reduz a lona pela área + perda.
import { io } from 'socket.io-client'
import { BASE, chamar, conferir, entrar, finalizar } from './e2e-util.mjs'

const ORIGEM = BASE.replace('/api/v1', '')
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const hoje = new Date().toISOString().slice(0, 10)

const admin = await entrar('admin@onprint.local', 'admin123', 'Admin12345')
const matriz = (await chamar('GET', '/permissoes', { token: admin })).json
const papel = (codigo) => matriz.papeis.find((p) => p.codigo === codigo).id
for (const [nome, email, p] of [
  ['Vera Vendedora', 'vera@onprint.local', 'vendedor'],
  ['Paulo Produção', 'paulo@onprint.local', 'producao'],
  ['Gustavo Gerente', 'gustavo@onprint.local', 'gerente'],
]) {
  await chamar('POST', '/usuarios', { token: admin, body: { nome, email, papelId: papel(p), senhaProvisoria: 'provisoria1', comissaoPercentual: '5' } })
}
const vera = await entrar('vera@onprint.local', 'provisoria1', 'Vendedora123')
const paulo = await entrar('paulo@onprint.local', 'provisoria1', 'Producao123')
const gustavo = await entrar('gustavo@onprint.local', 'provisoria1', 'Gerente123')

const posicao = async (nome) => (await chamar('GET', `/estoque/posicao?busca=${encodeURIComponent(nome)}`, { token: paulo })).json.data[0]
const saldoLona = async () => (await posicao('Lona 440')).saldo

console.log('— Locais e posição inicial —')
const locais = (await chamar('GET', '/estoque/locais', { token: paulo })).json
const almox = locais.find((l) => l.padrao)
conferir('local padrão criado pelo seed', almox?.nome, 'Almoxarifado')
const lona = await posicao('Lona 440')
conferir('lona começa sem estoque', `${lona.saldo} ${lona.situacao}`, '0.000 zerado')
conferir('badge de alertas conta os insumos zerados', (await chamar('GET', '/estoque/alertas/contagem', { token: paulo })).json.total >= 4, true)
conferir('vendedor não vê o estoque', (await chamar('GET', '/estoque/posicao', { token: vera })).status, 403)

console.log('\n— Entradas e custo médio —')
const forn = (await chamar('POST', '/fornecedores', { token: admin, body: { nome: 'Distribuidora de Lonas' } })).json
conferir('produção busca fornecedor pela rota do estoque', (await chamar('GET', '/estoque/fornecedores?busca=Distrib', { token: paulo })).json[0]?.nome, 'Distribuidora de Lonas')
const caneca = await posicao('Caneca branca')
const e1 = await chamar('POST', '/estoque/entradas', {
  token: paulo,
  body: { fornecedorId: forn.id, localId: almox.id, notaFiscal: '1234', dataEntrada: hoje, itens: [{ produtoId: lona.produto.id, quantidade: '100', custoUnitario: '9,50' }, { produtoId: caneca.produto.id, quantidade: '50', custoUnitario: '8' }] },
})
conferir('entrada registrada com número', `${e1.status} ${/^ENT-\d{4}-0001$/.test(e1.json.numero)}`, '201 true')
conferir('total da nota (100 × 9,50 + 50 × 8)', e1.json.total, '1350')
await chamar('POST', '/estoque/entradas', { token: paulo, body: { localId: almox.id, dataEntrada: hoje, itens: [{ produtoId: lona.produto.id, quantidade: '50', custoUnitario: '11' }] } })
const lona2 = await posicao('Lona 440')
conferir('saldo da lona após duas entradas', lona2.saldo, '150.000')
conferir('custo médio ponderado (100 × 9,50 + 50 × 11) ÷ 150', lona2.custoMedio, '10.0000')
conferir('custo do cadastro acompanha o custo médio', (await chamar('GET', `/produtos/${lona.produto.id}`, { token: admin })).json.custo, '10')
conferir('vendedor não registra entrada', (await chamar('POST', '/estoque/entradas', { token: vera, body: { localId: almox.id, dataEntrada: hoje, itens: [{ produtoId: lona.produto.id, quantidade: '1', custoUnitario: '1' }] } })).status, 403)
conferir('produto repetido na mesma entrada é recusado', (await chamar('POST', '/estoque/entradas', { token: paulo, body: { localId: almox.id, dataEntrada: hoje, itens: [{ produtoId: lona.produto.id, quantidade: '1', custoUnitario: '1' }, { produtoId: lona.produto.id, quantidade: '1', custoUnitario: '1' }] } })).status, 422)

console.log('\n— CRITÉRIO DE ACEITE: OP de banner concluída baixa a lona —')
const cat = (await chamar('GET', '/orcamentos/catalogo', { token: vera })).json
const cli = (await chamar('POST', '/clientes', { token: vera, body: { nome: 'Mercado Bom Preço', whatsapp: '11966665555' } })).json
const orc = (await chamar('POST', '/orcamentos', {
  token: vera,
  body: { clienteId: cli.id, itens: [{ produtoId: cat.find((p) => p.nome.startsWith('Banner')).id, quantidade: 1, largura: '2', altura: '1' }, { produtoId: cat.find((p) => p.nome.startsWith('Caneca')).id, quantidade: 10 }] },
})).json
await chamar('POST', `/orcamentos/${orc.id}/aprovar`, { token: vera, body: { nome: 'Cliente' } })
const pedidoId = (await chamar('POST', `/orcamentos/${orc.id}/converter`, { token: vera, body: { sinalPercentual: '50', parcelas: 1 } })).json.pedidoId
const ops = (await chamar('GET', `/producao/ops?pedidoId=${pedidoId}`, { token: paulo })).json.data
const opBanner = ops.find((o) => o.item.descricao.startsWith('Banner'))
const opCaneca = ops.find((o) => o.item.descricao.startsWith('Caneca'))
const mover = (op, etapa, token = paulo, extra = {}) => chamar('POST', `/producao/ops/${op.id}/mover`, { token, body: { etapa, ordemIds: [], ...extra } })
for (const op of [opBanner, opCaneca]) await mover(op, 'impressao', gustavo, { override: true, motivo: 'Teste do estoque' })
for (const etapa of ['acabamento', 'conferencia']) await mover(opBanner, etapa)
conferir('antes de concluir, a lona não mudou', await saldoLona(), '150.000')
await mover(opBanner, 'concluido')
conferir('BANNER 2 × 1 m CONCLUÍDO: 150 − (2 m² + 5%) = 147,9', await saldoLona(), '147.900')
const movsOp = (await chamar('GET', `/estoque/movimentacoes?opId=${opBanner.id}`, { token: paulo })).json.data
conferir('movimentação de consumo ligada à OP', `${movsOp.length} ${movsOp[0]?.tipo} ${movsOp[0]?.quantidade} ${movsOp[0]?.custoUnitario}`, '1 consumo_producao -2.1 10')
conferir('detalhe da OP mostra o insumo baixado', (await chamar('GET', `/producao/ops/${opBanner.id}`, { token: paulo })).json.consumos?.[0]?.quantidade, '-2.1')
await mover(opBanner, 'conferencia')
await mover(opBanner, 'concluido')
conferir('voltar e concluir de novo não baixa em dobro', await saldoLona(), '147.900')
for (const etapa of ['acabamento', 'conferencia', 'concluido']) await mover(opCaneca, etapa)
conferir('10 canecas + 2% de perda baixam 10,2 canecas brancas', (await posicao('Caneca branca')).saldo, '39.800')

console.log('\n— Movimentações manuais e alerta —')
const socket = await new Promise((resolve, reject) => {
  const s = io(ORIGEM, { path: '/socket.io', auth: { token: paulo }, transports: ['websocket'] })
  s.on('connect', () => resolve(s))
  s.on('connect_error', reject)
})
const avisos = []
socket.on('notificacao:nova', (e) => avisos.push(e))
await espera(300)
const lancar = (token, body) => chamar('POST', '/estoque/movimentacoes', { token, body })
conferir('saída maior que o saldo é recusada', (await lancar(paulo, { tipo: 'saida', produtoId: lona.produto.id, localId: almox.id, quantidade: '1000', motivo: 'teste' })).status, 422)
conferir('saída exige motivo', (await lancar(paulo, { tipo: 'saida', produtoId: lona.produto.id, localId: almox.id, quantidade: '1' })).status, 400)
const perda = await lancar(paulo, { tipo: 'perda', produtoId: lona.produto.id, localId: almox.id, quantidade: '97,9', motivo: 'Rolo molhado' })
conferir('perda de 97,9 m² deixa a lona no mínimo (50)', `${perda.status} ${await saldoLona()}`, '201 50.000')
await espera(500)
conferir('alerta de estoque baixo chegou em tempo real', avisos.some((a) => a.estoque), true)
socket.close()
conferir('lona aparece nos alertas', (await chamar('GET', '/estoque/posicao?alertas=true', { token: paulo })).json.data.some((l) => l.produto.id === lona.produto.id), true)
conferir('operador não ajusta inventário', (await lancar(paulo, { tipo: 'ajuste', produtoId: lona.produto.id, localId: almox.id, saldoContado: '60', motivo: 'Contagem' })).status, 403)
const ajuste = await lancar(gustavo, { tipo: 'ajuste', produtoId: lona.produto.id, localId: almox.id, saldoContado: '60', motivo: 'Contagem mensal' })
conferir('gerente ajusta pelo saldo contado (+10)', `${ajuste.status} ${ajuste.json[0]?.quantidade} ${await saldoLona()}`, '201 10 60.000')
conferir('ajuste igual ao saldo é recusado', (await lancar(gustavo, { tipo: 'ajuste', produtoId: lona.produto.id, localId: almox.id, saldoContado: '60', motivo: 'Contagem' })).status, 422)

console.log('\n— Transferência entre locais —')
const loja = (await chamar('POST', '/estoque/locais', { token: gustavo, body: { nome: 'Loja do centro' } })).json
const transf = await lancar(paulo, { tipo: 'transferencia', produtoId: lona.produto.id, localId: almox.id, localDestinoId: loja.id, quantidade: '5' })
conferir('transferência gera duas pernas', `${transf.status} ${transf.json.length}`, '201 2')
const porLocal = (await chamar('GET', `/estoque/produtos/${lona.produto.id}`, { token: paulo })).json
const saldoEm = (id) => porLocal.locais.find((l) => l.local.id === id)
conferir('almoxarifado 55, loja 5, total 60', `${saldoEm(almox.id).saldo} ${saldoEm(loja.id).saldo} ${porLocal.saldo}`, '55.000 5.000 60.000')
conferir('custo médio acompanha o material', saldoEm(loja.id).custoMedio, '10.0000')
conferir('local com saldo não pode ser desativado', (await chamar('PUT', `/estoque/locais/${loja.id}`, { token: gustavo, body: { nome: 'Loja do centro', ativo: false } })).status, 422)
conferir('local padrão não pode deixar de ser padrão direto', (await chamar('PUT', `/estoque/locais/${almox.id}`, { token: gustavo, body: { nome: 'Almoxarifado', padrao: false } })).status, 422)

console.log('\n— Cancelamento com estorno —')
const cancelado = await chamar('POST', `/pedidos/${pedidoId}/cancelar`, { token: admin, body: { motivo: 'Cliente desistiu do pedido', estornarEstoque: true } })
conferir('pedido cancelado', cancelado.json.status, 'cancelado')
conferir('lona consumida volta ao almoxarifado (55 + 2,1)', (await chamar('GET', `/estoque/produtos/${lona.produto.id}`, { token: paulo })).json.locais.find((l) => l.local.id === almox.id).saldo, '57.100')
conferir('canecas brancas voltam (39,8 + 10,2)', (await posicao('Caneca branca')).saldo, '50.000')
const estornos = (await chamar('GET', `/estoque/movimentacoes?pedidoId=${pedidoId}&tipo=ajuste`, { token: paulo })).json.data
conferir('estorno registrado como ajuste com motivo', estornos.every((m) => m.motivo.startsWith('Estorno do cancelamento')) && estornos.length === 2, true)

finalizar()
