// Teste ponta a ponta da Fase 7 (dashboard, relatórios, busca e notificações) num banco DESCARTÁVEL.
// Critério de aceite: os KPIs e os relatórios batem com consultas SQL feitas direto no banco.
import { PrismaClient } from '@prisma/client'
import { BASE, chamar, conferir, entrar, finalizar } from './e2e-util.mjs'

const db = new PrismaClient()
/** SQL direto: devolve o primeiro valor numérico da primeira linha. */
const sql = async (texto) => {
  const [linha] = await db.$queryRawUnsafe(texto)
  return Math.round(Number(Object.values(linha ?? { v: 0 })[0] ?? 0) * 100) / 100
}
const [{ hoje }] = await db.$queryRawUnsafe(`SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') AS hoje`)
const inicioMes = `${hoje.slice(0, 8)}01`
const DIA = `(created_at AT TIME ZONE 'America/Sao_Paulo')::date`

// ── Cenário: vendas, recusa, produção com perda, financeiro, estoque e balcão ──
const admin = await entrar('admin@onprint.local', 'admin123', 'Admin12345')
const matriz = (await chamar('GET', '/permissoes', { token: admin })).json
const papel = (c) => matriz.papeis.find((p) => p.codigo === c).id
for (const [nome, email, p] of [
  ['Vera Vendedora', 'vera@onprint.local', 'vendedor'],
  ['Bruno Vendedor', 'bruno@onprint.local', 'vendedor'],
  ['Carla Caixa', 'carla@onprint.local', 'caixa'],
]) {
  await chamar('POST', '/usuarios', { token: admin, body: { nome, email, papelId: papel(p), senhaProvisoria: 'provisoria1', comissaoPercentual: '5' } })
}
const vera = await entrar('vera@onprint.local', 'provisoria1', 'Vendedora123')
const bruno = await entrar('bruno@onprint.local', 'provisoria1', 'Vendedor123')
const carla = await entrar('carla@onprint.local', 'provisoria1', 'Caixa12345')

const cat = (await chamar('GET', '/orcamentos/catalogo', { token: vera })).json
const banner = cat.find((p) => p.nome.startsWith('Banner'))
const caneca = cat.find((p) => p.nome.startsWith('Caneca'))
const cli = (await chamar('POST', '/clientes', { token: vera, body: { nome: 'Mercado Bom Preço', whatsapp: '11966665555' } })).json
const cli2 = (await chamar('POST', '/clientes', { token: vera, body: { nome: 'Padaria Central', whatsapp: '11955554444' } })).json
const novoOrc = async (clienteId, itens) => (await chamar('POST', '/orcamentos', { token: vera, body: { clienteId, itens } })).json
const convertido = await novoOrc(cli.id, [{ produtoId: banner.id, quantidade: 2, largura: '2', altura: '1' }, { produtoId: caneca.id, quantidade: 10 }])
await chamar('POST', `/orcamentos/${convertido.id}/aprovar`, { token: vera, body: { nome: 'Cliente' } })
const pedidoId = (await chamar('POST', `/orcamentos/${convertido.id}/converter`, { token: vera, body: { sinalPercentual: '50', parcelas: 1 } })).json.pedidoId
const recusado = await novoOrc(cli2.id, [{ produtoId: banner.id, quantidade: 1, largura: '1', altura: '1' }])
await chamar('POST', `/orcamentos/${recusado.id}/enviar`, { token: vera })
await chamar('POST', `/orcamentos/${recusado.id}/recusar`, { token: vera, body: { motivo: 'Preço alto' } })
const aberto = await novoOrc(cli2.id, [{ produtoId: caneca.id, quantidade: 20 }])
await chamar('POST', `/orcamentos/${aberto.id}/enviar`, { token: vera })
await novoOrc(cli.id, [{ produtoId: caneca.id, quantidade: 5 }]) // rascunho
await chamar('POST', '/solicitacoes', { token: vera, body: { novoCliente: { nome: 'Loja Nova', whatsapp: '11944443333' }, descricao: 'Orçar adesivos para vitrine' } })
// Segundo pedido fica em produção (sinal vence hoje e fica em aberto)
const emProducao = await novoOrc(cli2.id, [{ produtoId: caneca.id, quantidade: 30 }])
await chamar('POST', `/orcamentos/${emProducao.id}/aprovar`, { token: vera, body: { nome: 'Cliente' } })
const pedido2 = (await chamar('POST', `/orcamentos/${emProducao.id}/converter`, { token: vera, body: { sinalPercentual: '30', parcelas: 2 } })).json.pedidoId
const op2 = (await chamar('GET', `/producao/ops?pedidoId=${pedido2}`, { token: admin })).json.data[0]
await chamar('POST', `/producao/ops/${op2.id}/mover`, { token: admin, body: { etapa: 'impressao', ordemIds: [], override: true, motivo: 'Cliente com pressa' } })

const almox = (await chamar('GET', '/estoque/locais', { token: admin })).json.find((l) => l.padrao)
const posicao = (await chamar('GET', '/estoque/posicao?busca=Lona%20440', { token: admin })).json.data[0]
await chamar('POST', '/estoque/entradas', { token: admin, body: { localId: almox.id, dataEntrada: hoje, itens: [{ produtoId: posicao.produto.id, quantidade: '100', custoUnitario: '10' }] } })
const ops = (await chamar('GET', `/producao/ops?pedidoId=${pedidoId}`, { token: admin })).json.data
for (const op of ops) {
  await chamar('POST', `/producao/ops/${op.id}/mover`, { token: admin, body: { etapa: 'impressao', ordemIds: [], override: true, motivo: 'Teste relatórios' } })
  for (const etapa of ['acabamento', 'conferencia', 'concluido']) await chamar('POST', `/producao/ops/${op.id}/mover`, { token: admin, body: { etapa, ordemIds: [] } })
}
await chamar('POST', `/producao/ops/${ops[0].id}/apontamentos`, { token: admin, body: { maquinaId: ops[0].maquinaId, inicio: new Date(Date.now() - 7200e3).toISOString(), fim: new Date(Date.now() - 3600e3).toISOString(), quantidadeProduzida: '2', perda: '0,5' } })

const formas = (await chamar('GET', '/financeiro/formas?pageSize=50', { token: admin })).json.data
const forma = (tipo) => formas.find((f) => f.tipo === tipo)
const titulos = (await chamar('GET', `/financeiro/receber?pedidoId=${pedidoId}&sort=vencimento:asc`, { token: admin })).json.data
await chamar('POST', `/financeiro/receber/${titulos[0].id}/baixa`, { token: admin, body: { valorRecebido: titulos[0].valor, data: hoje, formaPagamentoId: forma('cartao_credito').id } })
await chamar('POST', '/financeiro/receber', { token: admin, body: { clienteId: cli2.id, descricao: 'Serviço antigo', valor: '90', vencimento: '2026-01-10' } })
const aluguel = (await chamar('POST', '/financeiro/pagar', { token: admin, body: { descricao: 'Aluguel', valor: '1500', vencimento: hoje } })).json[0]
await chamar('POST', `/financeiro/pagar/${aluguel.id}/baixa`, { token: admin, body: { valorRecebido: '1000', data: hoje, formaPagamentoId: forma('pix').id } })

const caneta = (await chamar('POST', '/produtos', { token: admin, body: { nome: 'Caneta personalizada', tipo: 'revenda', modoCalculo: 'unidade', precoVenda: '5', custo: '2', controlaEstoque: true, estoqueMinimo: '2' } })).json
await chamar('POST', '/estoque/entradas', { token: admin, body: { localId: almox.id, dataEntrada: hoje, itens: [{ produtoId: caneta.id, quantidade: '20', custoUnitario: '2' }] } })
await chamar('POST', '/caixa/abrir', { token: carla, body: { valorAbertura: '50' } })
await chamar('POST', '/caixa/vendas', { token: carla, body: { itens: [{ produtoId: caneta.id, quantidade: '6' }], pagamentos: [{ formaPagamentoId: forma('dinheiro').id, valor: '30' }] } })

console.log('— CRITÉRIO DE ACEITE: dashboard × SQL direto —')
const dash = (await chamar('GET', '/dashboard', { token: admin })).json
const kpi = (chave) => dash.kpis.find((k) => k.chave === chave)?.valor
const esperado = {
  faturamento_mes: await sql(`SELECT (SELECT COALESCE(SUM(total),0) FROM pedidos WHERE status <> 'cancelado' AND ${DIA} >= '${inicioMes}')
                                 + (SELECT COALESCE(SUM(total),0) FROM vendas_pdv WHERE status = 'concluida' AND ${DIA} >= '${inicioMes}')`),
  orcamentos_abertos: await sql(`SELECT COUNT(*) FROM orcamentos WHERE status IN ('rascunho','enviado','em_negociacao')`),
  conversao: await sql(`SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'convertido') / NULLIF(COUNT(*) FILTER (WHERE status <> 'rascunho'), 0), 1) FROM orcamentos WHERE ${DIA} >= '${hoje}'::date - 89`),
  solicitacoes_novas: await sql(`SELECT COUNT(*) FROM solicitacoes_orcamento WHERE status IN ('nova', 'em_atendimento')`),
  pedidos_producao: await sql(`SELECT COUNT(*) FROM pedidos WHERE status = 'em_producao'`),
  pedidos_atrasados: await sql(`SELECT COUNT(*) FROM pedidos WHERE status IN ('aguardando_arte','arte_em_aprovacao','em_producao') AND data_prevista_entrega < '${hoje}'`),
  receber_hoje: await sql(`SELECT COALESCE(SUM(valor - valor_pago),0) FROM contas_receber WHERE status IN ('aberto','parcial','vencido') AND vencimento = '${hoje}'`),
  receber_vencido: await sql(`SELECT COALESCE(SUM(valor - valor_pago),0) FROM contas_receber WHERE status IN ('aberto','parcial','vencido') AND vencimento < '${hoje}'`),
  pagar_hoje: await sql(`SELECT COALESCE(SUM(valor - valor_pago),0) FROM contas_pagar WHERE status IN ('aberto','parcial','vencido') AND vencimento = '${hoje}'`),
  estoque_baixo: await sql(`SELECT COUNT(*) FROM produtos p WHERE controla_estoque AND ativo AND COALESCE((SELECT SUM(quantidade) FROM estoque_saldos s WHERE s.produto_id = p.id),0) <= estoque_minimo`),
}
for (const [chave, valor] of Object.entries(esperado)) conferir(`KPI ${chave}`, kpi(chave), valor)
conferir('cenário cobre os KPIs (valores não zerados)', ['faturamento_mes', 'solicitacoes_novas', 'pedidos_producao', 'receber_hoje', 'receber_vencido', 'pagar_hoje', 'estoque_baixo'].every((k) => esperado[k] > 0), true)
conferir('gráfico de faturamento: mês atual = KPI', dash.faturamentoMensal.at(-1).pedidos + dash.faturamentoMensal.at(-1).balcao, esperado.faturamento_mes)
conferir('produção por etapa (OPs abertas) × SQL', dash.producaoPorEtapa.reduce((s, e) => s + e.quantidade, 0), await sql(`SELECT COUNT(*) FROM ordens_producao WHERE NOT cancelada AND etapa_atual <> 'concluido'`))
conferir('vendedor sem "ver todos" vê só os próprios números', (await chamar('GET', '/dashboard', { token: bruno })).json.kpis.find((k) => k.chave === 'orcamentos_abertos').valor, 0)
conferir('vendedor não recebe blocos financeiros', (await chamar('GET', '/dashboard', { token: vera })).json.kpis.some((k) => k.chave === 'receber_hoje'), false)

console.log('\n— CRITÉRIO DE ACEITE: relatórios × SQL direto —')
const rel = async (tipo, visao, de = '2026-01-01', ate = hoje) => (await chamar('GET', `/relatorios/${tipo}?visao=${visao}&de=${de}&ate=${ate}`, { token: admin })).json
const resumo = (r, rotulo) => r.resumo.find((x) => x.rotulo === rotulo)?.valor
const vendasMes = await rel('vendas', 'mes')
const vendidoSql = await sql(`SELECT (SELECT SUM(total) FROM pedidos WHERE status <> 'cancelado') + (SELECT SUM(total) FROM vendas_pdv WHERE status = 'concluida')`)
conferir('vendas: total vendido', resumo(vendasMes, 'Total vendido'), vendidoSql)
conferir('vendas por mês: soma das linhas = total', Math.round(vendasMes.linhas.reduce((s, l) => s + l.total, 0) * 100) / 100, vendidoSql)
const porVendedor = await rel('vendas', 'vendedor')
conferir('vendas por vendedor (Vera)', porVendedor.linhas.find((l) => l.nome === 'Vera Vendedora')?.total, await sql(`SELECT SUM(p.total) FROM pedidos p JOIN usuarios u ON u.id = p.vendedor_id WHERE u.nome = 'Vera Vendedora' AND p.status <> 'cancelado'`))
conferir('vendas por produto (caneta no balcão)', (await rel('vendas', 'produto')).linhas.find((l) => l.nome === 'Caneta personalizada')?.total, await sql(`SELECT SUM(total) FROM vendas_pdv_itens WHERE descricao = 'Caneta personalizada'`))
const funil = await rel('orcamentos', 'funil')
conferir('orçamentos: taxa de conversão', resumo(funil, 'Taxa de conversão'), await sql(`SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'convertido') / COUNT(*) FILTER (WHERE status <> 'rascunho'), 2) FROM orcamentos`))
conferir('orçamentos: motivo "Preço alto"', (await rel('orcamentos', 'recusas')).linhas.find((l) => l.motivo === 'Preço alto')?.quantidade, await sql(`SELECT COUNT(*) FROM orcamentos WHERE motivo_recusa = 'Preço alto'`))
conferir('produção: passagens de etapa', resumo(await rel('producao', 'etapas'), 'Passagens de etapa'), await sql(`SELECT COUNT(*) FROM op_etapas_historico WHERE etapa_de IS NOT NULL`))
conferir('produção: OPs concluídas por máquina', resumo(await rel('producao', 'maquinas'), 'OPs concluídas'), await sql(`SELECT COUNT(*) FROM ordens_producao WHERE etapa_atual = 'concluido' AND maquina_id IS NOT NULL`))
conferir('produção: perda apontada', resumo(await rel('producao', 'perdas'), 'Perda'), await sql(`SELECT SUM(perda) FROM op_apontamentos`))
conferir('estoque: valor em estoque', resumo(await rel('estoque', 'posicao'), 'Valor em estoque'), await sql(`SELECT SUM(quantidade * custo_medio) FROM estoque_saldos WHERE quantidade > 0`))
conferir('estoque: valor consumido (curva ABC)', resumo(await rel('estoque', 'abc'), 'Valor consumido'), await sql(`SELECT SUM(-quantidade * custo_unitario) FROM estoque_movimentacoes WHERE tipo IN ('consumo_producao','venda_pdv','saida','perda')`))
const dre = await rel('financeiro', 'dre')
conferir('DRE: receitas', resumo(dre, 'Receitas'), await sql(`SELECT SUM(m.valor) FROM movimentos_financeiros m JOIN categorias_financeiras c ON c.id = m.categoria_id WHERE c.tipo = 'receita' AND m.tipo = 'entrada'`))
conferir('DRE: despesas (aluguel + taxa de cartão)', resumo(dre, 'Despesas'), await sql(`SELECT SUM(valor) FROM movimentos_financeiros WHERE tipo = 'saida' AND transferencia_id IS NULL`))
conferir('inadimplência: total vencido', resumo(await rel('financeiro', 'inadimplencia'), 'Total vencido'), await sql(`SELECT SUM(valor - valor_pago) FROM contas_receber WHERE status IN ('aberto','parcial','vencido') AND vencimento < '${hoje}'`))
const comissoes = await rel('comissoes', 'vendedor')
conferir('comissões: previstas', resumo(comissoes, 'Previstas'), await sql(`SELECT SUM(valor) FROM comissoes WHERE status = 'prevista'`))
conferir('visão inválida é recusada', (await chamar('GET', `/relatorios/vendas?visao=xyz&de=${hoje}&ate=${hoje}`, { token: admin })).status, 422)
conferir('vendedor sem acesso aos relatórios', (await chamar('GET', `/relatorios/vendas?visao=mes&de=${hoje}&ate=${hoje}`, { token: vera })).status, 403)

console.log('\n— Busca global e notificações —')
const busca = (await chamar('GET', '/busca?q=Mercado', { token: admin })).json
conferir('busca acha cliente, orçamento e pedido', `${busca.clientes.length > 0} ${busca.orcamentos.length > 0} ${busca.pedidos.length > 0}`, 'true true true')
conferir('outro vendedor não acha pedidos da Vera', (await chamar('GET', '/busca?q=Mercado', { token: bruno })).json.pedidos.length, 0)
conferir('busca pelo número do pedido', (await chamar('GET', '/busca?q=PED-2026-0001', { token: vera })).json.pedidos.length, 1)
const notif = (await chamar('GET', '/notificacoes', { token: vera })).json
conferir('vendedora tem notificação de pedido pronto', notif.data.some((n) => n.titulo.includes('pronto')), true)
conferir('contagem de não lidas', (await chamar('GET', '/notificacoes/contagem', { token: vera })).json.naoLidas, notif.naoLidas)
await chamar('POST', `/notificacoes/${notif.data[0].id}/lida`, { token: vera })
conferir('marcar uma como lida', (await chamar('GET', '/notificacoes/contagem', { token: vera })).json.naoLidas, notif.naoLidas - 1)
conferir('não marca notificação de outro usuário', (await chamar('POST', `/notificacoes/${notif.data[1]?.id ?? notif.data[0].id}/lida`, { token: bruno })).json.atualizadas, 0)
await chamar('POST', '/notificacoes/lidas', { token: vera, body: {} })
conferir('marcar todas como lidas', (await chamar('GET', '/notificacoes/contagem', { token: vera })).json.naoLidas, 0)

await db.$disconnect()
finalizar()
