// Teste ponta a ponta da Fase 3 (comercial) num banco DESCARTÁVEL recém-criado com seed.
// Critério de aceite: cliente pré-cadastrado → orçamento → aprovação pelo link (sem login) → pedido com contas a receber.
import { chamar, conferir, entrar, finalizar } from './e2e-util.mjs'

/** Valores monetários chegam como string decimal canônica ("160", "40.5"); compara em centavos. */
const reais = (v) => (v === undefined || v === null ? v : Number(v).toFixed(2))

const admin = await entrar('admin@onprint.local', 'admin123', 'Admin12345')
const matriz = (await chamar('GET', '/permissoes', { token: admin })).json
const papel = (codigo) => matriz.papeis.find((p) => p.codigo === codigo).id
for (const [nome, email] of [['Vera Vendedora', 'vera@onprint.local'], ['Bruno Vendedor', 'bruno@onprint.local']]) {
  await chamar('POST', '/usuarios', { token: admin, body: { nome, email, papelId: papel('vendedor'), senhaProvisoria: 'provisoria1', comissaoPercentual: '5' } })
}
const vera = await entrar('vera@onprint.local', 'provisoria1', 'Vendedora123')
const bruno = await entrar('bruno@onprint.local', 'provisoria1', 'Vendedor123')

console.log('— Catálogo para orçar (vendedor não acessa o cadastro de produtos) —')
const catalogo = await chamar('GET', '/orcamentos/catalogo?busca=banner', { token: vera })
conferir('vendedor busca produtos pelo catálogo', catalogo.status, 200)
const banner = catalogo.json[0]
conferir('catálogo não expõe custo ao vendedor', 'custo' in banner && banner.custo !== undefined, false)
const acab = (nome) => banner.acabamentos.find((a) => a.acabamento.nome.startsWith(nome)).acabamentoId

console.log('\n— 1. Solicitação com pré-cadastro do cliente —')
const sol = await chamar('POST', '/solicitacoes', {
  token: vera,
  body: { novoCliente: { nome: 'Padaria Pão Quente', whatsapp: '(11) 98888-7777' }, origem: 'whatsapp', descricao: 'Banner 2×1 para a fachada, com ilhós.' },
})
conferir('solicitação criada', sol.status, 201)
conferir('numeração SOL', /^SOL-\d{4}-0001$/.test(sol.json.numero), true)
conferir('cliente entrou como pré-cadastro', sol.json.cliente?.situacao, 'pre_cadastro')

console.log('\n— 2. Orçamento (a API recalcula) —')
const itemBanner = { produtoId: banner.id, quantidade: 1, largura: '2', altura: '1', acabamentoIds: [acab('Ilhós'), acab('Bainha')] }
const orc = await chamar('POST', '/orcamentos', { token: vera, body: { clienteId: sol.json.clienteId, solicitacaoId: sol.json.id, itens: [itemBanner] } })
conferir('orçamento criado', orc.status, 201)
conferir('numeração ORC', /^ORC-\d{4}-0001$/.test(orc.json.numero), true)
conferir('total recalculado pela API (R$ 160,00)', reais(orc.json.total), '160.00')
conferir('vendedor não vê custo do orçamento', orc.json.custoEstimado, undefined)
conferir('solicitação passou para "orçada"', (await chamar('GET', `/solicitacoes/${sol.json.id}`, { token: vera })).json.status, 'orcada')
conferir('valores enviados pelo front são ignorados', reais((await chamar('POST', '/orcamentos', { token: vera, body: { clienteId: sol.json.clienteId, itens: [{ ...itemBanner, total: '1.00' }] } })).json.total), '160.00')
const abaixo = await chamar('POST', '/orcamentos', { token: vera, body: { clienteId: sol.json.clienteId, itens: [{ ...itemBanner, precoUnitario: '50' }] } })
conferir('vendedor: preço abaixo do mínimo bloqueado', abaixo.status, 422)
const liberado = await chamar('POST', '/orcamentos', { token: admin, body: { clienteId: sol.json.clienteId, itens: [{ ...itemBanner, precoUnitario: '50' }] } })
conferir('admin (aprovar) libera preço abaixo do mínimo', liberado.json.itens?.[0]?.precoLiberadoPor?.nome, 'Administrador')
conferir('outro vendedor não vê o orçamento', (await chamar('GET', `/orcamentos/${orc.json.id}`, { token: bruno })).status, 404)
conferir('lista do outro vendedor vem vazia', (await chamar('GET', '/orcamentos', { token: bruno })).json.meta.total, 0)
conferir('marcar como enviado', (await chamar('POST', `/orcamentos/${orc.json.id}/enviar`, { token: vera })).json.status, 'enviado')

console.log('\n— 3. Aprovação pelo link público (sem login) —')
const token = orc.json.tokenPublico
const publico = await chamar('GET', `/publico/orcamentos/${token}`)
conferir('link abre sem login', publico.status, 200)
conferir('cliente vê o total', reais(publico.json.total), '160.00')
conferir('link não expõe dados internos', JSON.stringify(publico.json).includes('custo') || JSON.stringify(publico.json).includes('observacoesInternas'), false)
conferir('token inválido', (await chamar('GET', '/publico/orcamentos/token-que-nao-existe-123456')).status, 404)
conferir('aprovar exige aceite', (await chamar('POST', `/publico/orcamentos/${token}/aprovar`, { body: { nome: 'João da Padaria' } })).status, 400)
const aprovado = await chamar('POST', `/publico/orcamentos/${token}/aprovar`, { body: { nome: 'João da Padaria', aceite: true } })
conferir('cliente aprova pelo link', aprovado.json.status, 'aprovado')
conferir('não aprova duas vezes', (await chamar('POST', `/publico/orcamentos/${token}/aprovar`, { body: { nome: 'João', aceite: true } })).status, 422)
const aposAprovar = (await chamar('GET', `/orcamentos/${orc.json.id}`, { token: vera })).json
conferir('registrou quem aprovou', aposAprovar.aprovadoPorNome, 'João da Padaria')
conferir('registrou o IP', Boolean(aposAprovar.aprovadoIp), true)

console.log('\n— 4. Conversão em pedido —')
const conv = await chamar('POST', `/orcamentos/${orc.json.id}/converter`, { token: vera, body: { sinalPercentual: '50', parcelas: 2, intervaloDias: 30 } })
conferir('conversão', conv.status, 200)
const pedido = conv.json.pedido
conferir('orçamento virou "convertido"', conv.json.status, 'convertido')
conferir('pedido PED criado', /^PED-\d{4}-0001$/.test(pedido?.numero ?? ''), true)
conferir('pedido aguardando arte', pedido?.status, 'aguardando_arte')
conferir('contas a receber: sinal + 2 parcelas', pedido?.contasReceber.map((c) => reais(c.valor)).join(' + '), '80.00 + 40.00 + 40.00')
conferir('soma das contas = total do pedido', pedido?.contasReceber.reduce((s, c) => s + Number(c.valor), 0).toFixed(2), reais(pedido?.total))
conferir('comissão prevista (5% de 160)', reais(pedido?.comissoes[0]?.valor), '8.00')
conferir('uma arte aguardando arquivo por item', pedido?.itens[0]?.artes[0]?.status, 'aguardando_arquivo')
const cliente = (await chamar('GET', `/clientes/${sol.json.clienteId}`, { token: vera })).json
conferir('cliente promovido de pré-cadastro para ativo', cliente.situacao, 'ativo')
conferir('não converte duas vezes', (await chamar('POST', `/orcamentos/${orc.json.id}/converter`, { token: vera, body: { sinalPercentual: '50' } })).status, 409)

console.log('\n— Outras ações —')
const dup = await chamar('POST', `/orcamentos/${orc.json.id}/duplicar`, { token: vera })
conferir('duplicar gera novo rascunho', `${dup.status} ${dup.json.status}`, '201 rascunho')
await chamar('POST', `/orcamentos/${dup.json.id}/enviar`, { token: vera })
conferir('cliente recusa pelo link', (await chamar('POST', `/publico/orcamentos/${dup.json.tokenPublico}/recusar`, { body: { motivo: 'Achei caro' } })).json.status, 'recusado')
conferir('reabrir para negociação', (await chamar('POST', `/orcamentos/${dup.json.id}/reabrir`, { token: vera })).json.status, 'em_negociacao')
conferir('rascunho não converte (precisa aprovar)', (await chamar('POST', `/orcamentos/${dup.json.id}/converter`, { token: vera, body: { sinalPercentual: '50' } })).status, 422)

finalizar()
