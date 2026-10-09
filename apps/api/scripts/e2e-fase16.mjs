// Teste ponta a ponta da fila de etiquetas num banco DESCARTÁVEL recém-criado com seed.
// Critério de aceite: OP concluída entra sozinha na fila; adicionar à mão não duplica; marcar impressas tira da fila
// (e dá para desfazer); quem não vê a produção recebe 403.
import { chamar, conferir, entrar, finalizar } from './e2e-util.mjs'

const admin = await entrar('admin@onprint.local', 'admin123', 'Admin12345')
const matriz = (await chamar('GET', '/permissoes', { token: admin })).json
const papel = (codigo) => matriz.papeis.find((p) => p.codigo === codigo).id
for (const [nome, email, p] of [
  ['Paulo Produção', 'paulo@etq.local', 'producao'],
  ['Fátima Financeiro', 'fatima@etq.local', 'financeiro'],
  ['Vera Vendedora', 'vera@etq.local', 'vendedor'],
]) {
  await chamar('POST', '/usuarios', { token: admin, body: { nome, email, papelId: papel(p), senhaProvisoria: 'provisoria1' } })
}
const paulo = await entrar('paulo@etq.local', 'provisoria1', 'Producao123')
const fatima = await entrar('fatima@etq.local', 'provisoria1', 'Financeiro123')
const vera = await entrar('vera@etq.local', 'provisoria1', 'Vendedora123')

// Pedido com dois itens (banner e caneca) → duas OPs
const cat = (await chamar('GET', '/orcamentos/catalogo', { token: admin })).json
const banner = cat.find((p) => p.nome.startsWith('Banner'))
const caneca = cat.find((p) => p.nome.startsWith('Caneca'))
const cli = (await chamar('POST', '/clientes', { token: admin, body: { nome: 'TESTE-ETIQUETA Loja Azul', whatsapp: '11977776666' } })).json
const orc = (await chamar('POST', '/orcamentos', { token: admin, body: { clienteId: cli.id, itens: [{ produtoId: banner.id, quantidade: 1, largura: '2', altura: '1' }, { produtoId: caneca.id, quantidade: 10 }] } })).json
await chamar('POST', `/orcamentos/${orc.id}/aprovar`, { token: admin, body: { nome: 'Cliente' } })
const conv = (await chamar('POST', `/orcamentos/${orc.id}/converter`, { token: admin, body: { sinalPercentual: '50', parcelas: 1 } })).json
const pedido = (await chamar('GET', `/pedidos/${conv.pedidoId}`, { token: admin })).json
const ops = (await chamar('GET', `/producao/ops?pedidoId=${pedido.id}`, { token: paulo })).json.data
const opBanner = ops.find((o) => o.item.descricao.startsWith('Banner'))
const opCaneca = ops.find((o) => o.item.descricao.startsWith('Caneca'))
conferir('pedido com duas OPs', ops.length, 2)

const fila = async (token = paulo) => (await chamar('GET', '/etiquetas/fila', { token })).json
// Admin libera sem arte aprovada (override) para chegar direto em "concluído"
const mover = (op, etapa) => chamar('POST', `/producao/ops/${op.id}/mover`, { token: admin, body: { etapa, ordemIds: [], override: true, motivo: 'Teste da fila de etiquetas' } })

console.log('— Entrada automática ao concluir —')
conferir('fila começa vazia', (await fila()).length, 0)
conferir('OP do banner concluída', (await mover(opBanner, 'concluido')).status, 200)
let f = await fila()
conferir('banner entrou sozinho na fila', `${f.length} ${f[0]?.ordemProducaoId === opBanner.id} ${f[0]?.automatica}`, '1 true true')
conferir('linha traz pedido, cliente e item', `${f[0]?.pedido.numero === pedido.numero} ${f[0]?.pedido.cliente} ${f[0]?.item.startsWith('Banner')}`, 'true TESTE-ETIQUETA Loja Azul true')

console.log('\n— Inclusão manual sem duplicar —')
let r = await chamar('POST', '/etiquetas/fila', { token: paulo, body: { opIds: [opBanner.id] } })
conferir('mesma OP de novo: nada entra', `${r.status} ${r.json.adicionadas} ${r.json.jaNaFila}`, '200 0 1')
r = await chamar('POST', '/etiquetas/fila', { token: paulo, body: { pedidoIds: [pedido.id] } })
conferir('pedido inteiro: só a caneca entra', `${r.status} ${r.json.adicionadas} ${r.json.jaNaFila}`, '200 1 1')
f = await fila()
conferir('fila com 2 etiquetas', f.length, 2)
conferir('a da caneca foi adicionada à mão', f.find((e) => e.ordemProducaoId === opCaneca.id)?.automatica, false)
conferir('pedido sem nada recusado', (await chamar('POST', '/etiquetas/fila', { token: paulo, body: {} })).status, 400)

console.log('\n— Marcar impressas (e desfazer) —')
const ids = f.map((e) => e.id)
r = await chamar('POST', '/etiquetas/fila/marcar-impressas', { token: paulo, body: { ids } })
conferir('duas marcadas como impressas', `${r.status} ${r.json.marcadas}`, '200 2')
conferir('fila ficou vazia', (await fila()).length, 0)
r = await chamar('POST', '/etiquetas/fila/voltar', { token: paulo, body: { ids: [ids[0]] } })
conferir('desfazer devolve à fila', `${r.json.voltaram} ${(await fila()).length}`, '1 1')
await chamar('POST', '/etiquetas/fila/marcar-impressas', { token: paulo, body: { ids: [ids[0]] } })
// Reimpressão: depois de impressa pode entrar de novo — e dois cliques ao mesmo tempo não duplicam
const [r1, r2] = await Promise.all([1, 2].map(() => chamar('POST', '/etiquetas/fila', { token: paulo, body: { opIds: [opBanner.id] } })))
conferir('reimpressão: entra de novo, uma vez só (cliques simultâneos)', `${r1.json.adicionadas + r2.json.adicionadas} ${(await fila()).length}`, '1 1')
const reimpressao = (await fila())[0]
conferir('remover da fila', (await chamar('DELETE', `/etiquetas/fila/${reimpressao.id}`, { token: paulo })).status, 204)
conferir('remover de novo: não encontrada', (await chamar('DELETE', `/etiquetas/fila/${reimpressao.id}`, { token: paulo })).status, 404)

console.log('\n— OP que volta da conclusão —')
await mover(opCaneca, 'concluido')
conferir('caneca concluída entrou na fila', (await fila()).filter((e) => e.ordemProducaoId === opCaneca.id).length, 1)
await mover(opCaneca, 'conferencia')
conferir('voltou para conferência: saiu da fila', (await fila()).length, 0)

console.log('\n— Permissões —')
conferir('vendedora (vê a produção) consulta a fila', (await chamar('GET', '/etiquetas/fila', { token: vera })).status, 200)
conferir('financeiro (sem produção) não vê a fila', (await chamar('GET', '/etiquetas/fila', { token: fatima })).status, 403)
conferir('financeiro não adiciona', (await chamar('POST', '/etiquetas/fila', { token: fatima, body: { opIds: [opBanner.id] } })).status, 403)
conferir('financeiro não marca impressas', (await chamar('POST', '/etiquetas/fila/marcar-impressas', { token: fatima, body: { ids } })).status, 403)
conferir('sem login: 401', (await chamar('GET', '/etiquetas/fila')).status, 401)

finalizar()
