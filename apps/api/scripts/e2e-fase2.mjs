// Teste ponta a ponta da Fase 2 (produtos e motor de preço) num banco DESCARTÁVEL recém-criado com seed.
// Uso (dentro do container da API): node apps/api/scripts/e2e-fase2.mjs http://127.0.0.1:3334/api/v1
import { chamar, conferir, entrar, finalizar } from './e2e-util.mjs'

const admin = await entrar('admin@onprint.local', 'admin123', 'Admin12345')

const lista = await chamar('GET', '/produtos?busca=banner', { token: admin })
const banner = lista.json.data[0]
conferir('catálogo de exemplo: banner encontrado', banner?.nome, 'Banner em lona 440 g')
const detalhe = (await chamar('GET', `/produtos/${banner.id}`, { token: admin })).json
const idAcab = (nome) => detalhe.acabamentos.find((a) => a.acabamento.nome.startsWith(nome)).acabamentoId

console.log('\n— CRITÉRIO DE ACEITE: banner 2×1 m + ilhós + bainha —')
const sim = await chamar('POST', `/produtos/${banner.id}/simular`, {
  token: admin,
  body: { quantidade: 1, largura: '2', altura: '1', acabamentoIds: [idAcab('Ilhós'), idAcab('Bainha')] },
})
conferir('simulação na API', sim.status, 200)
conferir('produto: 2 m² × R$ 65,00', sim.json.valorProduto, '130.00')
conferir('ilhós: 6 m de perímetro × R$ 2,00', sim.json.acabamentos.find((a) => a.nome.startsWith('Ilhós'))?.valor, '12.00')
conferir('bainha: 6 m de perímetro × R$ 3,00', sim.json.acabamentos.find((a) => a.nome === 'Bainha')?.valor, '18.00')
conferir('TOTAL (cálculo manual R$ 160,00)', sim.json.total, '160.00')
conferir('admin vê a margem', sim.json.margemPercentual, '62.75')

console.log('\n— Regras de cálculo na API —')
conferir('medida acima do máximo (4 × 4 m) é recusada', (await chamar('POST', `/produtos/${banner.id}/simular`, { token: admin, body: { quantidade: 1, largura: '4', altura: '4' } })).json.ok, false)
conferir('preço abaixo do mínimo é sinalizado', (await chamar('POST', `/produtos/${banner.id}/simular`, { token: admin, body: { quantidade: 1, largura: '1', altura: '1', precoUnitario: '50' } })).json.abaixoDoMinimo, true)
const cartao = (await chamar('GET', '/produtos?busca=cart', { token: admin })).json.data[0]
conferir('cartão 1.500 un = 2 milheiros (R$ 240,00)', (await chamar('POST', `/produtos/${cartao.id}/simular`, { token: admin, body: { quantidade: 1500 } })).json.total, '240.00')

console.log('\n— Cadastros —')
const novo = await chamar('POST', '/produtos', { token: admin, body: { nome: 'Placa PS 2 mm', modoCalculo: 'm2', precoVenda: '180,00', custo: '70,00' } })
conferir('produto criado com código automático', /^PRD-\d{4}$/.test(novo.json.codigo), true)
conferir('código repetido', (await chamar('POST', '/produtos', { token: admin, body: { nome: 'Outro', codigo: novo.json.codigo } })).status, 409)
conferir('preço mínimo maior que o de venda', (await chamar('POST', '/produtos', { token: admin, body: { nome: 'X1', precoVenda: '10', precoMinimo: '20' } })).status, 400)
conferir('ficha técnica só aceita insumos', (await chamar('PUT', `/produtos/${novo.json.id}/insumos`, { token: admin, body: { itens: [{ insumoId: banner.id, quantidade: '1' }] } })).status, 422)
const lona = (await chamar('GET', '/produtos?tipo=insumo&busca=lona', { token: admin })).json.data[0]
conferir('ficha técnica com lona + 5% de perda', (await chamar('PUT', `/produtos/${novo.json.id}/insumos`, { token: admin, body: { itens: [{ insumoId: lona.id, quantidade: '1', base: 'por_m2', perdaPercentual: '5' }] } })).status, 200)

const cat = await chamar('POST', '/categorias', { token: admin, body: { nome: 'Placas' } })
const sub = await chamar('POST', '/categorias', { token: admin, body: { nome: 'PS', paiId: cat.json.id } })
conferir('subcategoria criada', sub.status, 201)
conferir('categoria não pode virar filha da própria subcategoria', (await chamar('PUT', `/categorias/${cat.json.id}`, { token: admin, body: { nome: 'Placas', paiId: sub.json.id } })).status, 422)
const cats = (await chamar('GET', '/categorias', { token: admin })).json
conferir('caminho da subcategoria', cats.find((c) => c.id === sub.json.id)?.caminho, 'Placas › PS')
conferir('acabamento criado', (await chamar('POST', '/acabamentos', { token: admin, body: { nome: 'Recorte eletrônico', tipoCobranca: 'por_m2', valor: '8,50' } })).status, 201)
conferir('máquina criada', (await chamar('POST', '/maquinas', { token: admin, body: { nome: 'Router CNC', larguraUtil: '1,30', custoHora: '60' } })).status, 201)

console.log('\n— Permissões —')
const matriz = (await chamar('GET', '/permissoes', { token: admin })).json
const papel = (codigo) => matriz.papeis.find((p) => p.codigo === codigo).id
await chamar('POST', '/usuarios', { token: admin, body: { nome: 'Paulo Produção', email: 'paulo@onprint.local', papelId: papel('producao'), senhaProvisoria: 'provisoria1' } })
await chamar('POST', '/usuarios', { token: admin, body: { nome: 'Vera Vendedora', email: 'vera@onprint.local', papelId: papel('vendedor'), senhaProvisoria: 'provisoria1' } })
const producao = await entrar('paulo@onprint.local', 'provisoria1', 'Producao123')
const vend = await entrar('vera@onprint.local', 'provisoria1', 'Vendedora123')
const vistoPelaProducao = (await chamar('GET', `/produtos/${banner.id}`, { token: producao })).json
conferir('produção vê o produto', vistoPelaProducao.nome, 'Banner em lona 440 g')
conferir('produção NÃO vê custo', 'custo' in vistoPelaProducao, false)
conferir('produção NÃO vê margem na simulação', (await chamar('POST', `/produtos/${banner.id}/simular`, { token: producao, body: { quantidade: 1, largura: '2', altura: '1' } })).json.margemPercentual, null)
conferir('produção não edita produto', (await chamar('PUT', `/produtos/${banner.id}`, { token: producao, body: { nome: 'x' } })).status, 403)
conferir('vendedor sem acesso a produtos', (await chamar('GET', '/produtos', { token: vend })).status, 403)

finalizar()
