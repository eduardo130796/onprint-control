// Teste ponta a ponta da Fase 8: o fluxo completo do negócio, cada etapa executada pelo papel responsável.
// Critério de aceite: fluxo de ponta a ponta sem erros por cada papel (também roda contra o compose de produção:
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node apps/api/scripts/e2e-fase8.mjs https://localhost/api/v1).
import { chamar, conferir, entrar, finalizar } from './e2e-util.mjs'

const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWM4w8AARwgWXg4AWIMMwVLWc8oAAAAASUVORK5CYII=', 'base64')

console.log('— Admin cria a equipe (um usuário por papel) —')
const admin = await entrar('admin@onprint.local', 'admin123', 'Admin12345')
const matriz = (await chamar('GET', '/permissoes', { token: admin })).json
const papel = (codigo) => matriz.papeis.find((p) => p.codigo === codigo).id
const equipe = [
  ['Gil Gerente', 'gil@onprint.local', 'gerente', 'Gerente1234'],
  ['Vera Vendedora', 'vera@onprint.local', 'vendedor', 'Vendedora123'],
  ['Diana Designer', 'diana@onprint.local', 'designer', 'Designer123'],
  ['Paulo Produção', 'paulo@onprint.local', 'producao', 'Producao123'],
  ['Fábio Financeiro', 'fabio@onprint.local', 'financeiro', 'Financeiro123'],
  ['Carla Caixa', 'carla@onprint.local', 'caixa', 'Caixa12345'],
]
const t = {}
for (const [nome, email, p, senha] of equipe) {
  const r = await chamar('POST', '/usuarios', { token: admin, body: { nome, email, papelId: papel(p), senhaProvisoria: 'provisoria1', comissaoPercentual: p === 'vendedor' ? '5' : undefined } })
  conferir(`admin cadastra ${p}`, r.status, 201)
  t[p] = await entrar(email, 'provisoria1', senha)
}
conferir('gerente não gerencia usuários', (await chamar('GET', '/usuarios', { token: t.gerente })).status, 403)

console.log('\n— Gerente prepara o estoque —')
const almox = (await chamar('GET', '/estoque/locais', { token: t.gerente })).json.find((l) => l.padrao)
const posicao = async (nome) => (await chamar('GET', `/estoque/posicao?busca=${encodeURIComponent(nome)}`, { token: t.producao })).json.data[0]
const lona = await posicao('Lona 440')
const caneta = (await chamar('POST', '/produtos', { token: t.gerente, body: { nome: 'Caneta personalizada', tipo: 'revenda', modoCalculo: 'unidade', precoVenda: '5', custo: '2', controlaEstoque: true, estoqueMinimo: '2' } })).json
let r = await chamar('POST', '/estoque/entradas', { token: t.gerente, body: { localId: almox.id, dataEntrada: hoje, itens: [{ produtoId: lona.produto.id, quantidade: '50', custoUnitario: '9' }, { produtoId: caneta.id, quantidade: '20', custoUnitario: '2' }] } })
conferir('entrada de lona e canetas', r.status, 201)
const saldoLonaAntes = Number((await posicao('Lona 440')).saldo)

console.log('\n— Vendedora: cliente, orçamento, aprovação e conversão —')
const cat = (await chamar('GET', '/orcamentos/catalogo', { token: t.vendedor })).json
const cli = (await chamar('POST', '/clientes', { token: t.vendedor, body: { nome: 'Mercado Bom Preço', whatsapp: '11966665555' } })).json
const orc = (await chamar('POST', '/orcamentos', { token: t.vendedor, body: { clienteId: cli.id, itens: [{ produtoId: cat.find((p) => p.nome.startsWith('Banner')).id, quantidade: 1, largura: '2', altura: '1' }, { produtoId: cat.find((p) => p.nome.startsWith('Caneca')).id, quantidade: 10 }] } })).json
conferir('orçamento criado', orc.status, 'rascunho')
await chamar('POST', `/orcamentos/${orc.id}/enviar`, { token: t.vendedor })
await chamar('POST', `/orcamentos/${orc.id}/aprovar`, { token: t.vendedor, body: { nome: 'Cliente (WhatsApp)' } })
r = await chamar('POST', `/orcamentos/${orc.id}/converter`, { token: t.vendedor, body: { sinalPercentual: '50', parcelas: 1 } })
conferir('orçamento convertido em pedido', r.status, 200)
const pedidoId = r.json.pedidoId
const pedido = async () => (await chamar('GET', `/pedidos/${pedidoId}`, { token: t.gerente })).json
conferir('pedido aguardando arte', (await pedido()).status, 'aguardando_arte')
conferir('vendedora não acessa o financeiro', (await chamar('GET', '/financeiro/receber', { token: t.vendedor })).status, 403)

console.log('\n— Designer: artes e aprovação do cliente pelo link —')
for (const item of (await pedido()).itens) {
  const form = new FormData()
  form.append('arquivo', new Blob([PNG], { type: 'image/png' }), `arte-${item.id}.png`)
  const arte = (await chamar('POST', `/pedidos/itens/${item.id}/artes`, { token: t.designer, form })).json
  await chamar('POST', `/artes/${arte.id}/enviar`, { token: t.designer })
  r = await chamar('POST', `/publico/artes/${arte.tokenPublico}/aprovar`, { body: { nome: 'Carlos Mercado', aceite: true } })
  conferir(`cliente aprova a arte (${item.descricao.split(' ')[0]})`, r.json.status, 'aprovada')
}
conferir('designer não edita o pedido', (await chamar('POST', `/pedidos/${pedidoId}/cancelar`, { token: t.designer, body: { motivo: 'teste de permissão' } })).status, 403)

console.log('\n— Produção: OPs até concluir (baixa de estoque) —')
const ops = (await chamar('GET', `/producao/ops?pedidoId=${pedidoId}`, { token: t.producao })).json.data
for (const op of ops) {
  for (const etapa of ['pre_impressao', 'impressao', 'acabamento', 'conferencia', 'concluido']) {
    r = await chamar('POST', `/producao/ops/${op.id}/mover`, { token: t.producao, body: { etapa, ordemIds: [op.id] } })
    if (r.status !== 200) conferir(`mover OP para ${etapa}`, r.status, 200)
  }
}
conferir('pedido ficou pronto sozinho', (await pedido()).status, 'pronto')
conferir('lona baixada: 2 m² + 5% de perda', +(saldoLonaAntes - Number((await posicao('Lona 440')).saldo)).toFixed(3), 2.1)
conferir('produção não acessa o financeiro', (await chamar('GET', '/financeiro/receber', { token: t.producao })).status, 403)

console.log('\n— Vendedora: entrega —')
const entrega = (await chamar('POST', `/pedidos/${pedidoId}/entregas`, { token: t.vendedor, body: { tipo: 'retirada' } })).json
await chamar('POST', `/entregas/${entrega.id}/realizar`, { token: t.vendedor, body: { recebidoPor: 'Carlos' } })
conferir('pedido entregue', (await pedido()).status, 'entregue')

console.log('\n— Financeiro: recebe tudo → pedido pago → comissão —')
const formas = (await chamar('GET', '/financeiro/formas?pageSize=50', { token: t.financeiro })).json.data
const forma = (tipo) => formas.find((f) => f.tipo === tipo)
const titulos = (await chamar('GET', `/financeiro/receber?pedidoId=${pedidoId}`, { token: t.financeiro })).json.data
for (const titulo of titulos) await chamar('POST', `/financeiro/receber/${titulo.id}/baixa`, { token: t.financeiro, body: { valorRecebido: titulo.valor, data: hoje, formaPagamentoId: forma('pix').id } })
const pago = await pedido()
conferir('pedido pago', pago.statusFinanceiro, 'pago')
conferir('comissão liberada', pago.comissoes[0]?.status, 'liberada')
const banco = (await chamar('GET', '/financeiro/contas?pageSize=50', { token: t.financeiro })).json.data.find((c) => c.tipo === 'banco')
r = await chamar('POST', '/financeiro/comissoes/pagar', { token: t.financeiro, body: { ids: [pago.comissoes[0].id], contaFinanceiraId: banco.id, data: hoje } })
conferir('comissão paga', r.status, 200)
const avulso = (await chamar('POST', '/financeiro/receber', { token: t.financeiro, body: { clienteId: cli.id, descricao: 'Instalação avulsa', valor: '80', vencimento: hoje } })).json[0]
conferir('financeiro não cria orçamentos', (await chamar('POST', '/orcamentos', { token: t.financeiro, body: { clienteId: cli.id, itens: [] } })).status, 403)

console.log('\n— Caixa: abre, vende, recebe e fecha sem diferença —')
await chamar('POST', '/caixa/abrir', { token: t.caixa, body: { valorAbertura: '50' } })
r = await chamar('POST', '/caixa/vendas', { token: t.caixa, body: { itens: [{ produtoId: caneta.id, quantidade: '3' }], pagamentos: [{ formaPagamentoId: forma('dinheiro').id, valor: '20' }] } })
conferir('venda no balcão com troco', `${r.status} ${r.json.troco}`, '201 5')
await chamar('POST', '/caixa/recebimentos', { token: t.caixa, body: { contaReceberId: avulso.id, valorRecebido: '80', formaPagamentoId: forma('dinheiro').id } })
const sessao = (await chamar('GET', '/caixa/atual', { token: t.caixa })).json
conferir('gaveta: 50 + 15 + 80', sessao.dinheiroEsperado, '145.00')
r = await chamar('POST', `/caixa/sessoes/${sessao.id}/fechar`, { token: t.caixa, body: { informados: [{ formaPagamentoId: forma('dinheiro').id, valor: '145' }] } })
conferir('caixa fechado sem diferença', `${r.json.status} ${Number(r.json.diferenca)}`, 'fechada 0')
conferir('caixa não vê o dashboard', (await chamar('GET', '/dashboard', { token: t.caixa })).status, 403)

console.log('\n— Gerente: dashboard e relatórios refletem o dia —')
const dash = (await chamar('GET', '/dashboard', { token: t.gerente })).json
const faturamento = Number(dash.kpis.find((k) => k.chave === 'faturamento_mes').valor)
conferir('faturamento do mês = pedido + balcão', faturamento, Number(pago.total) + 15)
const dre = (await chamar('GET', `/relatorios/financeiro?visao=dre&de=${hoje}&ate=${hoje}`, { token: t.gerente })).json
const receitas = Number(dre.resumo.find((x) => x.rotulo === 'Receitas').valor)
conferir('DRE: receitas do dia = pedido + balcão + avulso', receitas, Number(pago.total) + 15 + 80)
conferir('vendedora vê a notificação de pedido pronto', (await chamar('GET', '/notificacoes/contagem', { token: t.vendedor })).json.naoLidas > 0, true)

console.log('\n— Ajustes pós-testes: valor avulso, kanban de pedidos e de orçamentos —')
const orc2 = (await chamar('POST', '/orcamentos', { token: t.vendedor, body: { clienteId: cli.id, itens: [{ produtoId: cat.find((p) => p.nome.startsWith('Caneca')).id, quantidade: 20 }] } })).json
await chamar('POST', `/orcamentos/${orc2.id}/aprovar`, { token: t.vendedor, body: { nome: 'Cliente' } })
const ped2 = (await chamar('POST', `/orcamentos/${orc2.id}/converter`, { token: t.vendedor, body: { sinalPercentual: '50', parcelas: 1 } })).json.pedidoId
const tit2 = (await chamar('GET', `/financeiro/receber?pedidoId=${ped2}&sort=vencimento:asc`, { token: t.financeiro })).json.data
const total2 = tit2.reduce((s, x) => s + Number(x.valor), 0)
const metade = Number(tit2[0].valor)
const avulso2 = (metade + 10).toFixed(2)
const receberAvulso = (valor, token = t.financeiro) => chamar('POST', `/financeiro/receber/pedido/${ped2}`, { token, body: { valorRecebido: valor, data: hoje, formaPagamentoId: forma('pix').id } })
conferir('valor acima do aberto é recusado', (await receberAvulso((total2 + 1).toFixed(2))).status, 422)
conferir('vendedora não recebe valor avulso', (await receberAvulso('10', t.vendedor)).status, 403)
r = await receberAvulso(avulso2)
conferir('valor avulso abate em 2 parcelas', `${r.status} ${r.json.parcelasAbatidas}`, '200 2')
const tit2b = (await chamar('GET', `/financeiro/receber?pedidoId=${ped2}&sort=vencimento:asc`, { token: t.financeiro })).json.data
conferir('sinal quitado e R$ 10 na parcela seguinte', `${tit2b[0].status} ${Number(tit2b[1].valorPago)}`, 'pago 10')
conferir('pedido fica pago em parte', (await chamar('GET', `/pedidos/${ped2}`, { token: t.gerente })).json.statusFinanceiro, 'parcial')
r = await receberAvulso((total2 - metade - 10).toFixed(2))
conferir('o restante quita o pedido', (await chamar('GET', `/pedidos/${ped2}`, { token: t.gerente })).json.statusFinanceiro, 'pago')

let rec = (await chamar('GET', `/pedidos/${ped2}/recebimentos`, { token: t.vendedor })).json
conferir('recibo: 3 pagamentos somando o total', `${rec.pagamentos.length} ${rec.pagamentos.reduce((s, x) => s + Number(x.valor), 0).toFixed(2)}`, `3 ${total2.toFixed(2)}`)
conferir('caixa não acessa recebimentos do pedido', (await chamar('GET', `/pedidos/${ped2}/recebimentos`, { token: t.caixa })).status, 403)
const estornar = rec.pagamentos[2]
const tituloDoPagamento = tit2b.find((x) => x.descricao === estornar.descricao)
await chamar('POST', `/financeiro/receber/${tituloDoPagamento.id}/movimentos/${estornar.id}/estornar`, { token: t.financeiro, body: { motivo: 'Teste do recibo' } })
rec = (await chamar('GET', `/pedidos/${ped2}/recebimentos`, { token: t.vendedor })).json
conferir('recibo: pagamento estornado não entra', rec.pagamentos.some((x) => x.id === estornar.id), false)

const mudar = (id, status) => chamar('POST', `/pedidos/${id}/status`, { token: t.vendedor, body: { status } })
conferir('kanban: arrastar para "em produção" à mão', (await mudar(ped2, 'em_producao')).json.status, 'em_producao')
conferir('kanban: voltar para "aguardando arte"', (await mudar(ped2, 'aguardando_arte')).json.status, 'aguardando_arte')
conferir('kanban: cancelar arrastando é recusado', (await mudar(ped2, 'cancelado')).status, 422)
conferir('kanban: pedido entregue não sai da coluna', (await mudar(pedidoId, 'pronto')).status, 422)

const orc3 = (await chamar('POST', '/orcamentos', { token: t.vendedor, body: { clienteId: cli.id, itens: [{ produtoId: cat.find((p) => p.nome.startsWith('Caneca')).id, quantidade: 5 }] } })).json
const kanbanOrc = (await chamar('GET', '/orcamentos?kanban=true&pageSize=100', { token: t.vendedor })).json.data
conferir('kanban de orçamentos lista o rascunho novo', kanbanOrc.some((o) => o.id === orc3.id), true)
conferir('cartão do orçamento traz os itens principais', kanbanOrc.find((o) => o.id === orc3.id)?.resumo?.principais[0], '5 × Caneca personalizada')
const kanbanPed = (await chamar('GET', '/pedidos?kanban=true&pageSize=100', { token: t.gerente })).json.data
conferir('cartão do pedido traz os itens principais', kanbanPed.find((p) => p.id === ped2)?.resumo?.principais[0], '20 × Caneca personalizada')

console.log('\n— Status próprios (Configurações → Status) —')
const novoStatus = (body, token = t.gerente) => chamar('POST', '/status', { token, body: { cor: '#0EA5E9', ordem: 3, ...body } })
r = await novoStatus({ entidade: 'pedido', rotulo: 'Aguardando pagamento', base: 'pronto' })
conferir('gerente cria status próprio de pedido', `${r.status} ${r.json.sistema} ${r.json.base}`, '201 false pronto')
const aguardandoPgto = r.json
conferir('base "cancelado" não aceita status próprio', (await novoStatus({ entidade: 'pedido', rotulo: 'X', base: 'cancelado' })).status, 422)
conferir('status próprio em clientes não existe', (await novoStatus({ entidade: 'cliente', rotulo: 'X', base: 'ativo' })).status, 400)
conferir('vendedora não cria status', (await novoStatus({ entidade: 'pedido', rotulo: 'Y', base: 'pronto' }, t.vendedor)).status, 403)
const colocar = (status) => chamar('POST', `/pedidos/${ped2}/status-personalizado`, { token: t.vendedor, body: { statusPersonalizadoId: status } })
conferir('coluna própria só vale para pedido na base', (await colocar(aguardandoPgto.id)).status, 422)
await mudar(ped2, 'pronto')
r = await colocar(aguardandoPgto.id)
conferir('pedido "pronto" vai para "Aguardando pagamento"', `${r.status} ${r.json.statusPersonalizadoId === aguardandoPgto.id}`, '200 true')
await mudar(ped2, 'em_entrega')
conferir('mudou o status: a coluna própria é limpa', (await chamar('GET', `/pedidos/${ped2}`, { token: t.vendedor })).json.statusPersonalizadoId, null)
await mudar(ped2, 'pronto')
await colocar(aguardandoPgto.id)
const sistemaPronto = (await chamar('GET', '/status?entidade=pedido', { token: t.gerente })).json.find((x) => x.codigo === 'pronto')
conferir('status do sistema não pode ser excluído', (await chamar('DELETE', `/status/${sistemaPronto.id}`, { token: t.gerente })).status, 422)
r = await chamar('PUT', `/status/${sistemaPronto.id}`, { token: t.gerente, body: { rotulo: sistemaPronto.rotulo, cor: sistemaPronto.cor, ordem: sistemaPronto.ordem, ativo: false } })
conferir('status do sistema pode ser ocultado', r.json.ativo, false)
conferir('excluir status próprio', (await chamar('DELETE', `/status/${aguardandoPgto.id}`, { token: t.gerente })).status, 204)
conferir('pedido volta para a coluna da base', (await chamar('GET', `/pedidos/${ped2}`, { token: t.vendedor })).json.statusPersonalizadoId, null)
r = await novoStatus({ entidade: 'producao', rotulo: 'Laminação', base: 'acabamento' })
const opFila = (await chamar('GET', `/producao/ops?pedidoId=${ped2}`, { token: t.producao })).json.data[0]
conferir('etapa própria só vale para OP na etapa base', (await chamar('POST', `/producao/ops/${opFila.id}/etapa-personalizada`, { token: t.producao, body: { statusPersonalizadoId: r.json.id } })).status, 422)

finalizar()
