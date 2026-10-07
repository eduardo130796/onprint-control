// Teste ponta a ponta da Fase 4 (pedidos, arte e produção) num banco DESCARTÁVEL recém-criado com seed.
// Critério de aceite: mover uma OP em uma aba atualiza a outra (Socket.IO) e o pedido vira "pronto" sozinho.
import { io } from 'socket.io-client'
import { BASE, chamar, conferir, entrar, finalizar } from './e2e-util.mjs'

const ORIGEM = BASE.replace('/api/v1', '')
// PNG 4×4 vermelho (para testar a miniatura gerada com sharp)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWM4w8AARwgWXg4AWIMMwVLWc8oAAAAASUVORK5CYII=', 'base64')
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

const admin = await entrar('admin@onprint.local', 'admin123', 'Admin12345')
const matriz = (await chamar('GET', '/permissoes', { token: admin })).json
const papel = (codigo) => matriz.papeis.find((p) => p.codigo === codigo).id
const usuarios = [
  ['Vera Vendedora', 'vera@onprint.local', 'vendedor'],
  ['Bruno Vendedor', 'bruno@onprint.local', 'vendedor'],
  ['Diana Designer', 'diana@onprint.local', 'designer'],
  ['Paulo Produção', 'paulo@onprint.local', 'producao'],
]
for (const [nome, email, p] of usuarios) await chamar('POST', '/usuarios', { token: admin, body: { nome, email, papelId: papel(p), senhaProvisoria: 'provisoria1', comissaoPercentual: '5' } })
const vera = await entrar('vera@onprint.local', 'provisoria1', 'Vendedora123')
const bruno = await entrar('bruno@onprint.local', 'provisoria1', 'Vendedor123')
const diana = await entrar('diana@onprint.local', 'provisoria1', 'Designer123')
const paulo = await entrar('paulo@onprint.local', 'provisoria1', 'Producao123')

async function pedidoAprovado(nomeCliente, whatsapp) {
  const cat = (await chamar('GET', '/orcamentos/catalogo', { token: vera })).json
  const banner = cat.find((p) => p.nome.startsWith('Banner'))
  const caneca = cat.find((p) => p.nome.startsWith('Caneca'))
  const cli = (await chamar('POST', '/clientes', { token: vera, body: { nome: nomeCliente, whatsapp } })).json
  const orc = (await chamar('POST', '/orcamentos', {
    token: vera,
    body: { clienteId: cli.id, itens: [{ produtoId: banner.id, quantidade: 1, largura: '2', altura: '1' }, { produtoId: caneca.id, quantidade: 10 }] },
  })).json
  await chamar('POST', `/orcamentos/${orc.id}/aprovar`, { token: vera, body: { nome: 'Cliente (WhatsApp)' } })
  const conv = (await chamar('POST', `/orcamentos/${orc.id}/converter`, { token: vera, body: { sinalPercentual: '50', parcelas: 1 } })).json
  return (await chamar('GET', `/pedidos/${conv.pedidoId}`, { token: vera })).json
}

console.log('— Pedido e OPs geradas na conversão —')
let pedido = await pedidoAprovado('Mercado Bom Preço', '11966665555')
conferir('pedido nasce aguardando arte', pedido.status, 'aguardando_arte')
const ops = (await chamar('GET', `/producao/ops?pedidoId=${pedido.id}`, { token: paulo })).json.data
conferir('uma OP por item, na fila', ops.map((o) => o.etapaAtual).join(','), 'fila,fila')
conferir('OP do banner com máquina e horas (2 m² ÷ 12 m²/h)', `${ops.find((o) => o.item.descricao.startsWith('Banner'))?.maquina?.nome} ${Number(ops.find((o) => o.item.descricao.startsWith('Banner'))?.horasEstimadas)}`, 'Plotter eco-solvente 1,60 m 0.17')
conferir('outro vendedor não vê o pedido', (await chamar('GET', `/pedidos/${pedido.id}`, { token: bruno })).status, 404)
const [itemBanner, itemCaneca] = pedido.itens
const opBanner = ops.find((o) => o.pedidoItemId === itemBanner.id)
const opCaneca = ops.find((o) => o.pedidoItemId === itemCaneca.id)

console.log('\n— Arte versionada e aprovação pelo link —')
const enviarArte = async (itemId, nome) => {
  const form = new FormData()
  form.append('arquivo', new Blob([PNG], { type: 'image/png' }), nome)
  return chamar('POST', `/pedidos/itens/${itemId}/artes`, { token: diana, form })
}
const v1 = await enviarArte(itemBanner.id, 'banner-v1.png')
conferir('designer envia a arte v1', `${v1.status} v${v1.json.versao} ${v1.json.status}`, '201 v1 em_criacao')
conferir('miniatura gerada', Boolean(v1.json.miniaturaId), true)
conferir('vendedor não manda arte ao cliente', (await chamar('POST', `/artes/${v1.json.id}/enviar`, { token: vera })).status, 403)
await enviarArte(itemBanner.id, 'banner-v2.png')
conferir('versão antiga não pode ser enviada', (await chamar('POST', `/artes/${v1.json.id}/enviar`, { token: diana })).status, 422)
const ultima = (await chamar('GET', `/pedidos/${pedido.id}`, { token: diana })).json.itens[0].artes[0]
conferir('segundo arquivo virou v2', ultima.versao, 2)
await chamar('POST', `/artes/${ultima.id}/enviar`, { token: diana })
pedido = (await chamar('GET', `/pedidos/${pedido.id}`, { token: vera })).json
conferir('pedido foi para "arte em aprovação"', pedido.status, 'arte_em_aprovacao')
const pub = await chamar('GET', `/publico/principal/artes/${ultima.tokenPublico}`)
conferir('link da arte abre sem login', `${pub.status} ${pub.json.podeResponder}`, '200 true')
conferir('cliente pede ajuste', (await chamar('POST', `/publico/principal/artes/${ultima.tokenPublico}/ajuste`, { body: { nome: 'Carlos', comentario: 'Aumentar o logo' } })).json.status, 'ajuste_solicitado')
const v3 = await enviarArte(itemBanner.id, 'banner-v3.png')
await chamar('POST', `/artes/${v3.json.id}/enviar`, { token: diana })
conferir('link antigo não aceita mais resposta', (await chamar('POST', `/publico/principal/artes/${ultima.tokenPublico}/aprovar`, { body: { nome: 'Carlos', aceite: true } })).status, 422)
conferir('cliente aprova a v3 pelo link', (await chamar('POST', `/publico/principal/artes/${v3.json.tokenPublico}/aprovar`, { body: { nome: 'Carlos Mercado', aceite: true } })).json.status, 'aprovada')
conferir('vendedora comenta na arte (fala com o designer)', (await chamar('POST', `/artes/${v3.json.id}/comentarios`, { token: vera, body: { texto: 'Cliente pediu urgência' } })).status, 200)
conferir('link público não mostra comentário interno', (await chamar('GET', `/publico/principal/artes/${v3.json.tokenPublico}`)).json.comentarios.every((c) => c.origem === 'cliente'), true)

console.log('\n— Regra: OP só imprime com arte aprovada —')
const mover = (token, op, etapa, extra = {}) => chamar('POST', `/producao/ops/${op.id}/mover`, { token, body: { etapa, ordemIds: [op.id], ...extra } })
const semArte = await mover(paulo, opCaneca, 'impressao')
conferir('caneca sem arte: bloqueada', `${semArte.status} ${semArte.json.error?.details?.motivo}`, '422 ARTE_NAO_APROVADA')
conferir('operador não pode liberar (override)', (await mover(paulo, opCaneca, 'impressao', { override: true, motivo: 'urgente' })).status, 403)
conferir('gerente/admin libera com motivo', (await mover(admin, opCaneca, 'impressao', { override: true, motivo: 'Cliente enviou arte pronta por e-mail' })).status, 200)

console.log('\n— CRITÉRIO DE ACEITE: tempo real entre abas + pedido "pronto" sozinho —')
const conectar = (token) =>
  new Promise((resolve, reject) => {
    const s = io(ORIGEM, { path: '/socket.io', auth: { token }, transports: ['websocket'] })
    s.on('connect', () => resolve(s))
    s.on('connect_error', reject)
  })
const abaA = await conectar(paulo)
const abaB = await conectar(admin)
const abaVendedor = await conectar(vera)
const eventosB = []
const pedidosB = []
const notificacoesVera = []
abaB.on('op:atualizada', (e) => eventosB.push(e))
abaB.on('pedido:atualizado', (e) => pedidosB.push(e))
abaVendedor.on('notificacao:nova', (e) => notificacoesVera.push(e))
conferir('socket recusa conexão sem token', await new Promise((r) => io(ORIGEM, { path: '/socket.io', auth: { token: 'x' }, transports: ['websocket'] }).on('connect_error', (e) => r(e.message))), 'NAO_AUTENTICADO')
await espera(300)

for (const etapa of ['pre_impressao', 'impressao', 'acabamento', 'conferencia', 'concluido']) await mover(paulo, opBanner, etapa)
await espera(500)
conferir('a outra aba recebeu os movimentos da OP', eventosB.filter((e) => e.id === opBanner.id).length, 5)
conferir('pedido ainda em produção (caneca em impressão)', (await chamar('GET', `/pedidos/${pedido.id}`, { token: vera })).json.status, 'em_producao')
for (const etapa of ['acabamento', 'conferencia', 'concluido']) await mover(paulo, opCaneca, etapa)
await espera(500)
conferir('PEDIDO VIROU "PRONTO" SOZINHO', (await chamar('GET', `/pedidos/${pedido.id}`, { token: vera })).json.status, 'pronto')
conferir('a outra aba recebeu "pedido:atualizado" com pronto', pedidosB.some((e) => e.id === pedido.id && e.status === 'pronto'), true)
conferir('vendedora recebeu a notificação "pedido pronto"', notificacoesVera.length > 0, true)
abaA.close()
abaB.close()
abaVendedor.close()

const opDetalhe = (await chamar('GET', `/producao/ops/${opBanner.id}`, { token: paulo })).json
conferir('histórico de etapas com tempo na etapa', opDetalhe.historico.length, 6)
conferir('apontamento registrado', (await chamar('POST', `/producao/ops/${opBanner.id}/apontamentos`, { token: paulo, body: { inicio: new Date(Date.now() - 3600e3).toISOString(), fim: new Date().toISOString(), quantidadeProduzida: 1, perda: '0,1' } })).status, 201)
const hist = (await chamar('GET', `/pedidos/${pedido.id}/historico`, { token: vera })).json
conferir('linha do tempo registra o override', hist.some((e) => e.titulo.includes('sem arte aprovada')), true)

console.log('\n— Entrega —')
const entrega = await chamar('POST', `/pedidos/${pedido.id}/entregas`, { token: vera, body: { tipo: 'retirada' } })
conferir('retirada registrada', entrega.status, 201)
conferir('retirada realizada → pedido entregue', (await chamar('POST', `/entregas/${entrega.json.id}/realizar`, { token: vera, body: { recebidoPor: 'Carlos' } })).status, 200)
conferir('status final do pedido', (await chamar('GET', `/pedidos/${pedido.id}`, { token: vera })).json.status, 'entregue')

console.log('\n— Cancelamento —')
const outro = await pedidoAprovado('Padaria Central', '11955554444')
conferir('cancelar exige motivo', (await chamar('POST', `/pedidos/${outro.id}/cancelar`, { token: admin, body: { motivo: '' } })).status, 400)
const cancelado = (await chamar('POST', `/pedidos/${outro.id}/cancelar`, { token: admin, body: { motivo: 'Cliente desistiu do pedido' } })).json
conferir('pedido cancelado', cancelado.status, 'cancelado')
conferir('títulos em aberto cancelados', cancelado.contasReceber.every((c) => c.status === 'cancelado'), true)
conferir('comissão prevista removida', cancelado.comissoes.length, 0)
conferir('OPs canceladas saem do kanban', (await chamar('GET', `/producao/ops?pedidoId=${outro.id}`, { token: paulo })).json.meta.total, 0)

console.log('\n— PCP —')
const pcp = await chamar('GET', '/pcp', { token: paulo })
conferir('cockpit responde com carga por máquina', `${pcp.status} ${pcp.json.maquinas.length > 0}`, '200 true')
conferir('vendedor sem acesso ao PCP', (await chamar('GET', '/pcp', { token: vera })).status, 403)

finalizar()
