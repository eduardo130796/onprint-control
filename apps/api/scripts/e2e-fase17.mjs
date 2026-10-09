// Teste ponta a ponta da composição de custo e preço (docs/PRECIFICACAO.md) num banco DESCARTÁVEL com seed.
// Critério: insumo pela embalagem → composição → custo acompanha as compras → aviso e reajuste de preço.
import { chamar, conferir, entrar, finalizar } from './e2e-util.mjs'

const hoje = new Date().toISOString().slice(0, 10)
const admin = await entrar('admin@onprint.local', 'admin123', 'Admin12345')
const matriz = (await chamar('GET', '/permissoes', { token: admin })).json
const papel = (codigo) => matriz.papeis.find((p) => p.codigo === codigo).id
for (const [nome, email, p] of [
  ['Vera Vendedora', 'vera@onprint.local', 'vendedor'],
  ['Paulo Produção', 'paulo@onprint.local', 'producao'],
]) {
  await chamar('POST', '/usuarios', { token: admin, body: { nome, email, papelId: papel(p), senhaProvisoria: 'provisoria1' } })
}
const vera = await entrar('vera@onprint.local', 'provisoria1', 'Vendedora123')
const paulo = await entrar('paulo@onprint.local', 'provisoria1', 'Producao123')

const unidades = (await chamar('GET', '/unidades-medida', { token: admin })).json
const un = (sigla) => unidades.find((u) => u.sigla === sigla).id
const composicao = async (id, token = admin) => (await chamar('GET', `/produtos/${id}/composicao`, { token })).json
const custoDe = async (id) => (await chamar('GET', `/produtos/${id}`, { token: admin })).json.custo

console.log('— Catálogo de exemplo —')
const adesivo = (await chamar('GET', '/produtos?busca=Adesivo vinil', { token: admin })).json.data[0]
const cAdesivo = await composicao(adesivo.id)
conferir('adesivo do exemplo em composição', cAdesivo.modoCusto, 'composicao')
// vinil 12 × 1,08 + tinta 0,09 × 10,5 + plotter (5 min/m² + 5 de preparo) × R$ 45/h + corte 2 min × R$ 25/h
conferir('custo de referência do adesivo (R$/m²)', `${cAdesivo.referencia.porUnidade} ${cAdesivo.referencia.unidade}`, '22.24 m²')
conferir('produção automática pela velocidade da plotter', `${cAdesivo.producao[0].minutos} ${cAdesivo.producao[0].velocidadeM2Hora} ${cAdesivo.producao[0].custoHora}`, 'null 12.00 45.00')

console.log('\n— Insumos pela embalagem —')
let r = await chamar('POST', '/insumos', {
  token: admin,
  body: { nome: 'Lona teste 440g', unidadeMedidaId: un('m²'), embalagem: 'rolo', embalagemLargura: '3,20', embalagemComprimento: '50', precoEmbalagem: '1.450,00', estoqueMinimo: '10' },
})
const lona = r.json
conferir('insumo criado com código automático', `${r.status} ${/^PRD-\d{4}$/.test(lona.codigo)}`, '201 true')
conferir('rolo 3,20 × 50 m por R$ 1.450 = R$ 9,0625/m²', lona.custo, '9.0625')
r = await chamar('POST', '/insumos', { token: admin, body: { nome: 'Tinta teste', unidadeMedidaId: un('ml'), embalagem: 'galao', embalagemConteudo: '5000', precoEmbalagem: '450' } })
const tinta = r.json
conferir('galão de 5 l (5000 ml) por R$ 450 = R$ 0,09/ml', tinta.custo, '0.0900')
conferir('rolo sem medidas é recusado', (await chamar('POST', '/insumos', { token: admin, body: { nome: 'Sem medida', unidadeMedidaId: un('m²'), embalagem: 'rolo', precoEmbalagem: '10' } })).status, 400)
conferir('lista de insumos traz saldo e mínimo', (await chamar('GET', '/insumos?busca=Lona teste', { token: admin })).json.data[0]?.abaixoMinimo, true)
conferir('filtro abaixo do mínimo', (await chamar('GET', '/insumos?abaixoMinimo=true&busca=Lona teste', { token: admin })).json.meta.total, 1)

console.log('\n— Insumos fora de Produtos e Serviços —')
conferir('GET /produtos não lista insumos', (await chamar('GET', '/produtos?busca=Lona teste', { token: admin })).json.meta.total, 0)
conferir('GET /produtos?tipo=insumo ainda lista', (await chamar('GET', '/produtos?tipo=insumo&busca=Lona teste', { token: admin })).json.meta.total, 1)
conferir('nenhum insumo na lista padrão', (await chamar('GET', '/produtos?pageSize=100', { token: admin })).json.data.some((p) => p.tipo === 'insumo'), false)

console.log('\n— Composição do produto —')
const processos = (await chamar('GET', '/processos?busca=Impress', { token: admin })).json.data
const impressao = processos.find((p) => p.nome === 'Impressão digital')
const faixa = (await chamar('POST', '/produtos', { token: admin, body: { nome: 'Faixa teste', modoCalculo: 'm2', precoVenda: '20' } })).json
const corpo = {
  modoCusto: 'composicao',
  materiais: [
    { insumoId: lona.id, quantidade: '1', base: 'por_m2', perdaPercentual: '10' },
    { insumoId: tinta.id, quantidade: '10', base: 'por_m2' },
  ],
  producao: [{ processoId: impressao.id, base: 'por_m2' }],
  extras: [],
  lucroDesejado: '40',
  lucroMinimo: '20',
  precoVenda: '20',
}
r = await chamar('PUT', `/produtos/${faixa.id}/composicao`, { token: admin, body: corpo })
// lona 1,1 × 9,0625 = 9,97 + tinta 10 × 0,09 = 0,90 → 10,87; plotter padrão do processo 5 min × R$ 45/h = 3,75
conferir('composição salva', r.status, 200)
conferir('materiais / produção / custo direto', `${r.json.referencia?.materiais} ${r.json.referencia?.producao} ${r.json.referencia?.porUnidade}`, '10.87 3.75 14.62')
conferir('custo gravado no produto (o orçamento usa)', await custoDe(faixa.id), '14.62')
conferir('preço sugerido 14,62 ÷ (1 − 40%)', r.json.precoSugerido, '24.37')
conferir('análise do preço atual (R$ 20)', `${r.json.analise?.lucro} ${r.json.analise?.situacao}`, '5.38 ok')
conferir('material que não é insumo é recusado', (await chamar('PUT', `/produtos/${faixa.id}/composicao`, { token: admin, body: { ...corpo, materiais: [{ insumoId: adesivo.id, quantidade: '1' }] } })).status, 422)
conferir('preço mínimo acima do de venda é recusado', (await chamar('PUT', `/produtos/${faixa.id}/composicao`, { token: admin, body: { ...corpo, precoMinimo: '30' } })).status, 422)

console.log('\n— Compras mudam o custo —')
const locais = (await chamar('GET', '/estoque/locais', { token: admin })).json
const almox = locais.find((l) => l.padrao)
const entrada = (custo) => chamar('POST', '/estoque/entradas', { token: admin, body: { localId: almox.id, dataEntrada: hoje, itens: [{ produtoId: lona.id, quantidade: '100', custoUnitario: custo }] } })
conferir('entrada de 100 m² a R$ 9,50', (await entrada('9,50')).status, 201)
conferir('custo do insumo = custo médio', (await chamar('GET', `/insumos/${lona.id}`, { token: admin })).json.custo, '9.5000')
conferir('produto recalculado (1,1 × 9,50 + 0,90 + 3,75)', await custoDe(faixa.id), '15.1')
const avisos = async () => (await chamar('GET', '/notificacoes', { token: admin })).json.data.filter((n) => n.titulo === 'Reajuste de preços')
conferir('lucro ainda acima do mínimo: sem aviso', (await avisos()).length, 0)
await entrada('12,50')
const lonaDepois = (await chamar('GET', `/insumos/${lona.id}`, { token: admin })).json
conferir('custo médio consolidado (100 × 9,50 + 100 × 12,50) ÷ 200', `${lonaDepois.custo} ${lonaDepois.custoMedio} ${lonaDepois.saldo}`, '11.0000 11.0000 200.000')
conferir('produto recalculado (1,1 × 11 + 0,90 + 3,75)', await custoDe(faixa.id), '16.75')
conferir('onde é usado mostra o lucro baixo', `${lonaDepois.usadoEm} ${lonaDepois.produtos[0]?.nome} ${lonaDepois.produtos[0]?.situacao}`, '1 Faixa teste baixo')
const aviso = (await avisos())[0]
conferir('aviso de reajuste para quem edita produtos', aviso?.mensagem, 'O custo de Lona teste 440g subiu (R$ 9,50 → R$ 11,00/m²): 1 produto ficou abaixo do lucro mínimo.')
conferir('aviso leva ao reajuste', aviso?.link, '/produtos/reajuste')
conferir('vendedor não recebe o aviso', (await chamar('GET', '/notificacoes', { token: vera })).json.data.some((n) => n.titulo === 'Reajuste de preços'), false)

console.log('\n— Reajuste de preços —')
let lista = (await chamar('GET', '/produtos/reajuste', { token: admin })).json
const linha = lista.find((p) => p.id === faixa.id)
// lucro (20 − 16,75) ÷ 20 = 16,25%; sugerido 16,75 ÷ 0,60
conferir('faixa aparece abaixo do mínimo', `${linha?.situacao} ${linha?.lucroPercentual} ${linha?.precoSugerido} ${linha?.unidade}`, 'baixo 16.3 27.92 m²')
conferir('preço não mudou sozinho', (await composicao(faixa.id)).precoVenda, '20.00')
r = await chamar('POST', '/produtos/reajuste', { token: admin, body: { itens: [{ id: faixa.id, precoVenda: linha?.precoSugerido }] } })
conferir('reajuste aplicado', `${r.status} ${r.json.atualizados}`, '200 1')
lista = (await chamar('GET', '/produtos/reajuste', { token: admin })).json
conferir('faixa saiu da lista dos abaixo do mínimo', lista.some((p) => p.id === faixa.id), false)
conferir('novo preço gravado no produto', (await chamar('GET', `/produtos/${faixa.id}`, { token: admin })).json.precoVenda, '27.92')

console.log('\n— Precificação da empresa —')
const prec = { impostosPercentual: '6', comissaoPercentual: '5', rateioModo: 'nenhum', custoFixoPercentual: '0', custoFixoMensal: '0', horasProdutivasMes: 0, lucroDesejadoPadrao: '30', lucroMinimoPadrao: '15' }
conferir('produção não altera a precificação', (await chamar('PUT', '/empresa/precificacao', { token: paulo, body: prec })).status, 403)
conferir('precificação salva', (await chamar('PUT', '/empresa/precificacao', { token: admin, body: prec })).status, 200)
let c = await composicao(faixa.id)
// 27,92 − 11% (3,07) − 16,75 = 8,10; sugerido 16,75 ÷ (1 − 51%)
conferir('impostos e comissão entram na análise', `${c.parametros.percentuais.impostos} ${c.analise.despesasSobrePreco} ${c.analise.lucro} ${c.analise.situacao}`, '6.00 3.07 8.10 ok')
conferir('preço sugerido com os percentuais', c.precoSugerido, '34.18')
r = await chamar('PUT', '/empresa/precificacao', { token: admin, body: { ...prec, rateioModo: 'por_hora', custoFixoMensal: '1760', horasProdutivasMes: 176 } })
conferir('custo fixo por hora (1.760 ÷ 176)', r.json.custoFixoHora, '10.00')
// 5 min de produção × R$ 10/h = 0,83 de rateio
conferir('rateio por hora entra no custo', await custoDe(faixa.id), '17.58')

console.log('\n— Gatilhos: insumo e máquina —')
const lonaJson = (await chamar('GET', `/insumos/${lona.id}`, { token: admin })).json
r = await chamar('PUT', `/insumos/${lona.id}`, {
  token: admin,
  body: { nome: lonaJson.nome, unidadeMedidaId: un('m²'), embalagem: 'rolo', embalagemLargura: '3.2', embalagemComprimento: '50', precoEmbalagem: '1600', estoqueMinimo: '10' },
})
conferir('novo preço da embalagem vira o custo (1.600 ÷ 160)', r.json.custo, '10.0000')
conferir('produto recalculado (11 + 0,90 + 3,75 + 0,83)', await custoDe(faixa.id), '16.48')
const plotter = impressao.maquinaPadrao
const maquina = (await chamar('GET', `/maquinas/${plotter.id}`, { token: admin })).json
r = await chamar('PUT', `/maquinas/${plotter.id}`, {
  token: admin,
  body: { nome: maquina.nome, tipo: maquina.tipo, larguraUtil: maquina.larguraUtil, velocidadeM2Hora: maquina.velocidadeM2Hora, custoHora: '60', status: maquina.status, ativo: true },
})
conferir('custo/hora da plotter alterado', r.status, 200)
conferir('produto recalculado (5 min × R$ 60/h)', await custoDe(faixa.id), '17.73')

console.log('\n— Edição do produto sem preço —')
const placa = (await chamar('POST', '/produtos', { token: admin, body: { nome: 'Placa teste', modoCalculo: 'm2', precoVenda: '50', custo: '12,3456', precoMinimo: '45' } })).json
conferir('custo com 4 casas aceito', placa.custo, '12.3456')
r = await chamar('PUT', `/produtos/${placa.id}`, { token: admin, body: { nome: 'Placa teste 2', modoCalculo: 'm2' } })
conferir('sem os campos de preço: preço, custo e mínimo mantidos', `${r.status} ${r.json.precoVenda} ${r.json.custo} ${r.json.precoMinimo}`, '200 50 12.3456 45')
r = await chamar('PUT', `/produtos/${placa.id}`, { token: admin, body: { nome: 'Placa teste 2', precoVenda: '40' } })
conferir('preço abaixo do mínimo gravado é recusado', r.status, 422)
r = await chamar('PUT', `/produtos/${faixa.id}`, { token: admin, body: { nome: 'Faixa teste', modoCalculo: 'm2', custo: '1' } })
conferir('na composição o custo digitado é ignorado', `${r.json.custo} ${r.json.precoVenda}`, '17.73 27.92')

console.log('\n— Permissões —')
conferir('vendedor sem acesso aos insumos', (await chamar('GET', '/insumos', { token: vera })).status, 403)
conferir('vendedor sem composição', (await chamar('GET', `/produtos/${faixa.id}/composicao`, { token: vera })).status, 403)
conferir('produção não vê a composição', (await chamar('GET', `/produtos/${faixa.id}/composicao`, { token: paulo })).status, 403)
conferir('produção não vê reajuste', (await chamar('GET', '/produtos/reajuste', { token: paulo })).status, 403)
const vistoPaulo = (await chamar('GET', `/produtos/${faixa.id}`, { token: paulo })).json
conferir('produção não vê custo nem lucro do produto', 'custo' in vistoPaulo || 'lucroDesejado' in vistoPaulo || 'custoDetalhe' in vistoPaulo, false)
conferir('produção vê o custo do insumo (D92: lança a nota)', (await chamar('GET', `/insumos/${lona.id}`, { token: paulo })).json.custo, '10.0000')
conferir('produção não cria insumo', (await chamar('POST', '/insumos', { token: paulo, body: { nome: 'X', unidadeMedidaId: un('un') } })).status, 403)
const cat = (await chamar('GET', '/orcamentos/catalogo?busca=Faixa', { token: vera })).json
conferir('catálogo do vendedor sem custo', Array.isArray(cat) && cat.length > 0 && cat.every((p) => p.custo === undefined), true)

finalizar()
