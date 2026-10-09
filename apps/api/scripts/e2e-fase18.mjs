// Teste ponta a ponta da fase 3 da precificação — tudo interligado (docs/PRECIFICACAO.md) — num banco DESCARTÁVEL com seed.
// Critério: orçamento com custo pela medida real (composição + acabamento com insumos) e semáforo para o vendedor;
// pedido copia o custo; OP baixa materiais do produto e do acabamento (+ perda apontada); PDV baixa os materiais;
// compra gera conta a pagar; lucratividade e custo dos materiais na DRE.
import { PrismaClient } from '@prisma/client'
import { chamar, conferir, entrar, finalizar } from './e2e-util.mjs'

const db = new PrismaClient()
const linhas = (texto) => db.$queryRawUnsafe(texto)
const [{ hoje }] = await linhas(`SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') AS hoje`)
const emDias = (n) => new Date(Date.parse(`${hoje}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

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
const posicao = async (nome) => (await chamar('GET', `/estoque/posicao?busca=${encodeURIComponent(nome)}`, { token: admin })).json.data[0]
const almox = (await chamar('GET', '/estoque/locais', { token: admin })).json.find((l) => l.padrao)

console.log('— Cadastros: precificação, insumos, produto em composição e acabamento com insumos —')
await chamar('PUT', '/empresa/precificacao', {
  token: admin,
  body: { impostosPercentual: '10', comissaoPercentual: '0', rateioModo: 'nenhum', custoFixoPercentual: '0', custoFixoMensal: '0', horasProdutivasMes: 0, lucroDesejadoPadrao: '30', lucroMinimoPadrao: '15' },
})
const corte = (await chamar('POST', '/processos', { token: admin, body: { nome: 'Corte fase18', custoHora: '60' } })).json
const insumo = async (nome, sigla, preco) => (await chamar('POST', '/insumos', { token: admin, body: { nome, unidadeMedidaId: un(sigla), embalagem: 'unidade', precoEmbalagem: preco } })).json
const lona = await insumo('Lona fase18', 'm²', '10')
const ilhos = await insumo('Ilhós fase18', 'un', '0,10')
const adesivo = await insumo('Adesivo fase18', 'un', '0,50')
conferir('insumos com custo pela embalagem', `${lona.custo} ${ilhos.custo} ${adesivo.custo}`, '10.0000 0.1000 0.5000')

const banner = (await chamar('POST', '/produtos', { token: admin, body: { nome: 'Banner fase18', modoCalculo: 'm2', precoVenda: '50' } })).json
let r = await chamar('PUT', `/produtos/${banner.id}/composicao`, {
  token: admin,
  body: {
    modoCusto: 'composicao',
    materiais: [{ insumoId: lona.id, quantidade: '1', base: 'por_m2', perdaPercentual: '10' }],
    producao: [{ processoId: corte.id, minutos: '6', base: 'por_m2' }],
    extras: [],
    precoVenda: '50',
  },
})
// 1,1 m² × R$ 10 + 6 min × R$ 60/h
conferir('banner em composição (R$/m²)', r.json.referencia?.porUnidade, '17.00')

const acabBody = { nome: 'Ilhós fase18', tipoCobranca: 'por_perimetro', valor: '1', custo: '0,50', materiais: [{ insumoId: ilhos.id, quantidade: '2' }] }
r = await chamar('POST', '/acabamentos', { token: admin, body: acabBody })
const acab = r.json
conferir('acabamento criado com o insumo que gasta', `${r.status} ${acab.materiais?.length} ${acab.materiais?.[0]?.nome} ${acab.materiais?.[0]?.quantidade}`, '201 1 Ilhós fase18 2')
conferir('custo do insumo do acabamento para quem vê custos', acab.materiais?.[0]?.custoUnitario, '0.1000')
const { materiais: _semMateriais, ...acabSemMateriais } = acabBody
r = await chamar('PUT', `/acabamentos/${acab.id}`, { token: admin, body: acabSemMateriais })
conferir('editar sem "materiais" não mexe nos insumos', `${r.status} ${r.json.materiais?.length}`, '200 1')
conferir('material que não é insumo é recusado', (await chamar('PUT', `/acabamentos/${acab.id}`, { token: admin, body: { ...acabBody, materiais: [{ insumoId: banner.id, quantidade: '1' }] } })).status, 422)
conferir('lista de acabamentos traz os materiais', (await chamar('GET', '/acabamentos?busca=fase18', { token: admin })).json.data[0]?.materiais?.length, 1)
await chamar('PUT', `/produtos/${banner.id}/acabamentos`, { token: admin, body: { itens: [{ acabamentoId: acab.id, obrigatorio: true }] } })

const kit = (await chamar('POST', '/produtos', { token: admin, body: { nome: 'Kit adesivos fase18', modoCalculo: 'unidade', precoVenda: '20' } })).json
await chamar('PUT', `/produtos/${kit.id}/composicao`, {
  token: admin,
  body: { modoCusto: 'composicao', materiais: [{ insumoId: adesivo.id, quantidade: '2', base: 'por_unidade' }], producao: [], extras: [], precoVenda: '20' },
})
const placa = (await chamar('POST', '/produtos', { token: admin, body: { nome: 'Placa simples fase18', modoCalculo: 'm2', precoVenda: '60', custo: '20' } })).json

console.log('\n— Compra gera conta a pagar —')
const forn = (await chamar('POST', '/fornecedores', { token: admin, body: { nome: 'Distribuidora Fase 18' } })).json
const itensCompra = [
  { produtoId: lona.id, quantidade: '100', custoUnitario: '10' },
  { produtoId: ilhos.id, quantidade: '1000', custoUnitario: '0,10' },
  { produtoId: adesivo.id, quantidade: '100', custoUnitario: '0,50' },
]
const compra = (extra) => chamar('POST', '/estoque/entradas', { token: admin, body: { localId: almox.id, dataEntrada: hoje, notaFiscal: '1818', itens: itensCompra, ...extra } })
const parcelas = [
  { vencimento: emDias(30), valor: '575' },
  { vencimento: emDias(60), valor: '575' },
]
conferir('a prazo sem fornecedor é recusado', (await compra({ contaPagar: { parcelas } })).status, 422)
r = await compra({ fornecedorId: forn.id, contaPagar: { parcelas: [{ vencimento: emDias(30), valor: '1000' }] } })
conferir('parcelas que não somam o total são recusadas', `${r.status} ${/1\.150,00/.test(r.json?.message ?? r.json?.mensagem ?? JSON.stringify(r.json))}`, '422 true')
conferir('nada entrou no estoque com a recusa', (await posicao('Lona fase18')).saldo, '0.000')
r = await compra({ fornecedorId: forn.id, contaPagar: { parcelas } })
conferir('entrada a prazo registrada (total 1.150)', `${r.status} ${r.json.total}`, '201 1150')
const contas = await linhas(`SELECT cp.descricao, cp.documento, cp.valor::text AS valor, to_char(cp.vencimento, 'YYYY-MM-DD') AS vencimento, cp.status::text AS status, cp.fornecedor_id::text AS fornecedor, c.codigo
  FROM contas_pagar cp LEFT JOIN categorias_financeiras c ON c.id = cp.categoria_id WHERE cp.documento = '1818' ORDER BY cp.parcela`)
conferir('duas contas a pagar', contas.length, 2)
conferir('descrição com NF e fornecedor', contas[0]?.descricao, 'Compra NF 1818 — Distribuidora Fase 18 (1/2)')
conferir('documento, valor, vencimento e status', `${contas[1]?.documento} ${contas[1]?.valor} ${contas[1]?.vencimento} ${contas[1]?.status}`, `1818 575.00 ${emDias(60)} aberto`)
conferir('fornecedor e categoria "Compra de insumos"', `${contas[0]?.fornecedor === forn.id} ${contas[0]?.codigo}`, 'true compras_insumos')
// Empresa antiga sem a categoria: é criada na hora
await db.$executeRawUnsafe(`UPDATE categorias_financeiras SET codigo = NULL WHERE codigo = 'compras_insumos'`)
r = await chamar('POST', '/estoque/entradas', {
  token: admin,
  body: { fornecedorId: forn.id, localId: almox.id, dataEntrada: hoje, notaFiscal: '1819', itens: [{ produtoId: adesivo.id, quantidade: '10', custoUnitario: '0,50' }], contaPagar: { parcelas: [{ vencimento: emDias(15), valor: '5' }] } },
})
const [nova] = await linhas(`SELECT c.nome, c.codigo, cp.descricao FROM contas_pagar cp JOIN categorias_financeiras c ON c.id = cp.categoria_id WHERE cp.documento = '1819'`)
conferir('categoria recriada para empresa antiga', `${r.status} ${nova?.nome} ${nova?.codigo} ${nova?.descricao}`, '201 Compra de insumos compras_insumos Compra NF 1819 — Distribuidora Fase 18')

console.log('\n— Orçamento: custo pela medida real e semáforo —')
const cli = (await chamar('POST', '/clientes', { token: vera, body: { nome: 'Loja Fase 18', whatsapp: '11955554444' } })).json
const itemBanner = { produtoId: banner.id, quantidade: 1, largura: '2', altura: '1' }
r = await chamar('POST', '/orcamentos', { token: vera, body: { clienteId: cli.id, itens: [itemBanner] } })
const orc = r.json
conferir('vendedor cria o orçamento', `${r.status} ${orc.total}`, '201 106')
conferir('vendedor recebe só o semáforo', JSON.stringify(orc.itens?.[0]?.analise), '{"situacao":"ok"}')
conferir('vendedor não recebe custo (item, detalhe, acabamento)', `${orc.custoEstimado} ${orc.itens?.[0]?.custoEstimado} ${orc.itens?.[0]?.custoDetalhe} ${orc.itens?.[0]?.acabamentos?.[0]?.custo}`, 'undefined undefined undefined undefined')
conferir('semáforo do total para o vendedor', JSON.stringify(orc.analise), '{"situacao":"ok"}')
conferir('lucro mínimo do produto não vaza', orc.itens?.[0]?.produto?.lucroMinimo, undefined)
const doAdmin = (await chamar('GET', `/orcamentos/${orc.id}`, { token: admin })).json
const item = doAdmin.itens[0]
// lona 2 m² × 1,1 × 10 = 22 + 12 min × R$ 60/h = 12 + perímetro 6 m × 0,50 = 3 + 12 ilhoses × 0,10 = 1,20
conferir('custo estimado com as medidas reais', Number(item.custoEstimado), 38.2)
conferir('detalhe: materiais, produção, acabamentos', `${item.custoDetalhe?.materiais} ${item.custoDetalhe?.producao} ${item.custoDetalhe?.acabamentos} ${item.custoDetalhe?.custoDireto}`, '22.00 12.00 4.20 38.20')
conferir('linhas do custo', item.custoDetalhe?.linhas?.map((l) => `${l.grupo}:${l.valor}`).join(' '), 'material:22.00 producao:12.00 acabamento:3.00 acabamento:1.20')
conferir('custo do acabamento guardado no momento', Number(item.acabamentos?.[0]?.custo), 4.2)
// 106 − 10% (10,60) − 38,20 = 57,20
conferir('análise do item para quem vê custos', `${item.analise?.situacao} ${item.analise?.custoDireto} ${item.analise?.lucro} ${item.analise?.lucroPercentual} ${item.analise?.despesasSobrePreco}`, 'ok 38.20 57.20 54.0 10.60')
conferir('linhas na análise', item.analise?.linhas?.length, 4)
conferir('análise do total', `${doAdmin.analise?.custoDireto} ${doAdmin.analise?.lucro}`, '38.20 57.20')

console.log('\n— POST /orcamentos/analisar —')
const barato = { ...itemBanner, precoUnitario: '10' }
r = await chamar('POST', '/orcamentos/analisar', { token: vera, body: { itens: [barato] } })
// 2 × 10 + 6 = 26 − 2,60 − 38,20 = −14,80
conferir('vendedor: prejuízo só como semáforo', `${r.status} ${JSON.stringify(r.json)}`, '200 {"itens":[{"situacao":"prejuizo"}],"total":{"situacao":"prejuizo"}}')
r = await chamar('POST', '/orcamentos/analisar', { token: admin, body: { itens: [barato, { produtoId: placa.id, quantidade: 2, largura: '0,3', altura: '0,3' }] } })
conferir('admin: números do prejuízo', `${r.json.itens?.[0]?.lucro} ${r.json.itens?.[0]?.situacao}`, '-14.80 prejuizo')
conferir('modo simples: custo × área REAL (0,18 m² × 20)', r.json.itens?.[1]?.custoDireto, '3.60')
conferir('nada foi gravado', (await chamar('GET', `/orcamentos/${orc.id}`, { token: admin })).json.itens.length, 1)
conferir('produção não analisa orçamento', (await chamar('POST', '/orcamentos/analisar', { token: paulo, body: { itens: [itemBanner] } })).status, 403)

console.log('\n— Pedido copia o custo —')
await chamar('POST', `/orcamentos/${orc.id}/aprovar`, { token: vera, body: { nome: 'Cliente' } })
const pedidoId = (await chamar('POST', `/orcamentos/${orc.id}/converter`, { token: vera, body: { sinalPercentual: '0', parcelas: 1 } })).json.pedidoId
const pedAdmin = (await chamar('GET', `/pedidos/${pedidoId}`, { token: admin })).json
conferir('custo detalhado copiado na conversão', `${pedAdmin.itens?.[0]?.custoDetalhe?.custoDireto} ${pedAdmin.itens?.[0]?.custoDetalhe?.linhas?.length} ${Number(pedAdmin.itens?.[0]?.acabamentos?.[0]?.custo)}`, '38.20 4 4.2')
conferir('análise do pedido (admin)', `${pedAdmin.itens?.[0]?.analise?.lucro} ${pedAdmin.analise?.situacao}`, '57.20 ok')
const pedVera = (await chamar('GET', `/pedidos/${pedidoId}`, { token: vera })).json
conferir('pedido para o vendedor: só o semáforo', `${JSON.stringify(pedVera.itens?.[0]?.analise)} ${pedVera.itens?.[0]?.custoDetalhe} ${pedVera.itens?.[0]?.acabamentos?.[0]?.custo}`, '{"situacao":"ok"} undefined undefined')

console.log('\n— Produção: tempo pela composição e baixa com acabamento e perda —')
const op = (await chamar('GET', `/producao/ops?pedidoId=${pedidoId}`, { token: paulo })).json.data[0]
conferir('horas da OP pela composição (12 min)', Number(op.horasEstimadas), 0.2)
const mover = (etapa, token = paulo, extra = {}) => chamar('POST', `/producao/ops/${op.id}/mover`, { token, body: { etapa, ordemIds: [], ...extra } })
await mover('impressao', admin, { override: true, motivo: 'Teste da fase 18' })
r = await chamar('POST', `/producao/ops/${op.id}/apontamentos`, { token: paulo, body: { inicio: new Date(Date.now() - 3600e3).toISOString(), fim: new Date().toISOString(), quantidadeProduzida: 1, perda: '1' } })
conferir('perda de 1 peça apontada', r.status, 201)
for (const etapa of ['acabamento', 'conferencia', 'concluido']) await mover(etapa)
// 2 peças (1 + 1 refeita): lona 2 × 2 m² × 1,1 = 4,4; ilhós 2 × 6 m × 2 = 24
conferir('lona: 100 − 4,4', (await posicao('Lona fase18')).saldo, '95.600')
conferir('ilhós do acabamento: 1000 − 24', (await posicao('Ilhós fase18')).saldo, '976.000')
const movsOp = (await chamar('GET', `/estoque/movimentacoes?opId=${op.id}`, { token: admin })).json.data
conferir('duas baixas de consumo ligadas à OP e ao pedido', movsOp.map((m) => `${m.tipo}:${m.quantidade}`).sort().join(' '), 'consumo_producao:-24 consumo_producao:-4.4')

console.log('\n— PDV baixa os materiais e guarda o custo —')
const formas = (await chamar('GET', '/financeiro/formas?pageSize=50', { token: admin })).json.data
await chamar('POST', '/caixa/abrir', { token: admin, body: { valorAbertura: '0' } })
r = await chamar('POST', '/caixa/vendas', { token: admin, body: { itens: [{ produtoId: kit.id, quantidade: '3' }], pagamentos: [{ formaPagamentoId: formas.find((f) => f.tipo === 'dinheiro').id, valor: '60' }] } })
conferir('venda do kit', `${r.status} ${r.json.total}`, '201 60')
conferir('custo não aparece na venda', r.json.itens?.[0]?.custo, undefined)
conferir('adesivo baixado pela composição (110 − 3 × 2)', (await posicao('Adesivo fase18')).saldo, '104.000')
const [vi] = await linhas(`SELECT custo::text AS custo FROM vendas_pdv_itens WHERE venda_id = '${r.json.id}'`)
conferir('custo da venda guardado (3 × 2 × 0,50)', vi?.custo, '3.00')

console.log('\n— Lucratividade —')
const luc = (q, token = admin) => chamar('GET', `/relatorios/lucratividade?inicio=${hoje}&fim=${hoje}${q}`, { token })
r = await luc('&agrupar=pedido')
const linhaPed = r.json.linhas?.find((l) => l.id === pedidoId)
// real: 4,4 × 10 + 24 × 0,10 = 46,40
conferir('por pedido: receita, estimado e real', `${linhaPed?.receita} ${linhaPed?.custoEstimado} ${linhaPed?.custoMateriaisReal}`, '106.00 38.20 46.40')
conferir('por pedido: despesas, lucro, % e situação', `${linhaPed?.despesas} ${linhaPed?.lucro} ${linhaPed?.lucroPercentual} ${linhaPed?.situacao}`, '10.60 57.20 54.0 ok')
conferir('por pedido: cliente', linhaPed?.subtitulo, 'Loja Fase 18')
const somaReceita = r.json.linhas.reduce((s, l) => s + Number(l.receita), 0).toFixed(2)
conferir('totais somam as linhas', r.json.totais?.receita, somaReceita)
r = await luc('&agrupar=produto')
const linhaProd = r.json.linhas?.find((l) => l.id === banner.id)
conferir('por produto: banner', `${linhaProd?.titulo} ${linhaProd?.receita} ${linhaProd?.custoMateriaisReal}`, 'Banner fase18 106.00 46.40')
conferir('vendedor não vê a lucratividade', (await luc('', vera)).status, 403)

console.log('\n— DRE: custo dos materiais consumidos —')
const dre = (await chamar('GET', `/relatorios/financeiro?visao=dre&de=${hoje}&ate=${hoje}`, { token: admin })).json
const iMat = dre.linhas.findIndex((l) => l.categoria === 'Custo dos materiais consumidos')
const [esperado] = await linhas(`SELECT COALESCE(SUM(-quantidade * custo_unitario), 0)::float AS v FROM estoque_movimentacoes WHERE tipo IN ('consumo_producao','venda_pdv','perda')`)
conferir('linha informativa com o custo das baixas (46,40 + 3,00)', `${dre.linhas[iMat]?.valor} ${esperado.v}`, '49.4 49.4')
conferir('logo depois das receitas', iMat, dre.linhas.filter((l) => l.grupo === 'Receitas').length)
conferir('não entra no resultado', dre.resumo.find((x) => x.rotulo === 'Resultado')?.valor, Number((dre.resumo.find((x) => x.rotulo === 'Receitas').valor - dre.resumo.find((x) => x.rotulo === 'Despesas').valor).toFixed(2)))

console.log('\n— Insumo de acabamento obrigatório encarece: aviso de reajuste —')
r = await chamar('PUT', `/insumos/${ilhos.id}`, { token: admin, body: { nome: 'Ilhós fase18', unidadeMedidaId: un('un'), embalagem: 'unidade', precoEmbalagem: '5' } })
conferir('ilhós passa a custar R$ 5,00', r.json.custo, '5.0000')
const aviso = (await chamar('GET', '/notificacoes', { token: admin })).json.data.find((n) => n.titulo === 'Reajuste de preços' && n.mensagem?.startsWith('O custo de Ilhós fase18'))
// Referência 1 m²: 17 + 4 m × 0,50 + 8 ilhoses × 5 = 59 > preço 50 + 4 de acabamento
conferir('aviso considera o acabamento obrigatório', aviso?.mensagem, 'O custo de Ilhós fase18 subiu (R$ 0,10 → R$ 5,00/un): 1 produto ficou abaixo do lucro mínimo.')
r = await chamar('POST', '/orcamentos/analisar', { token: admin, body: { itens: [itemBanner] } })
// 22 + 12 + 3 + 12 × 5 = 97
conferir('orçamento novo já usa o custo novo do insumo', r.json.itens?.[0]?.custoDireto, '97.00')

await db.$disconnect()
finalizar()
