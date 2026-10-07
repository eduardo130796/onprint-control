// Dados de teste para o ambiente LOCAL: clientes, fornecedores, orçamentos, pedidos em cada situação
// de pagamento e contas a pagar. Tudo passa pela API, então parcelas, status e saldos saem como no uso real.
// Roda uma vez só: se os clientes de teste já existirem, não cria nada de novo.
// Uso (no container da API): node apps/api/scripts/dados-teste.mjs <e-mail> <senha> [url-da-api]
const [EMAIL = 'admin@onprint.local', SENHA = 'admin123', BASE = 'http://127.0.0.1:3333/api/v1'] = process.argv.slice(2)

async function chamar(metodo, caminho, body) {
  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`${metodo} ${caminho} → ${r.status}: ${JSON.stringify(json)}`)
  return json
}

// CPF e CNPJ válidos (dígitos verificadores calculados) a partir de uma base fixa
function digito(numeros, pesos) {
  const resto = numeros.reduce((s, n, i) => s + n * pesos[i], 0) % 11
  return resto < 2 ? 0 : 11 - resto
}
function cpf(base) {
  const n = [...base].map(Number)
  n.push(digito(n, [10, 9, 8, 7, 6, 5, 4, 3, 2]))
  n.push(digito(n, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]))
  return n.join('')
}
function cnpj(base) {
  const n = [...base].map(Number)
  n.push(digito(n, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]))
  n.push(digito(n, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]))
  return n.join('')
}

const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
const dia = (n) => new Date(Date.parse(`${hoje}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10)
const reais = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`

let token = null
const login = await chamar('POST', '/auth/login', { email: EMAIL, senha: SENHA }).catch(() => null)
if (!login) {
  console.error(`Não consegui entrar com ${EMAIL}. Passe o e-mail e a senha atuais: npm run dados-teste -- <e-mail> <senha>`)
  process.exit(1)
}
if (login.usuario.deveTrocarSenha) {
  console.error('Este usuário ainda precisa trocar a senha. Entre uma vez pelo sistema e rode de novo.')
  process.exit(1)
}
token = login.accessToken

if ((await chamar('GET', '/clientes?busca=11970000001')).data.length > 0) {
  console.log('Os dados de teste já existem (cliente Padaria Pão Quente). Nada foi criado.')
  process.exit(0)
}

const catalogo = await chamar('GET', '/orcamentos/catalogo')
const produto = (inicio) => {
  const p = catalogo.find((x) => x.nome.startsWith(inicio))
  if (!p) throw new Error(`Produto "${inicio}" não está no catálogo (rode o seed com os exemplos).`)
  return p.id
}
const banner = produto('Banner')
const adesivo = produto('Adesivo')
const cartao = produto('Cartão de visita')
const caneca = produto('Caneca')
const formas = (await chamar('GET', '/financeiro/formas?pageSize=50')).data
const forma = (tipo) => formas.find((f) => f.tipo === tipo)?.id ?? formas[0].id

console.log('— Clientes —')
const clientes = {}
for (const [chave, dados, endereco] of [
  ['padaria', { tipoPessoa: 'PJ', nome: 'Padaria Pão Quente Ltda', fantasia: 'Padaria Pão Quente', cpfCnpj: cnpj('112223330001'), whatsapp: '11970000001', email: 'contato@paoquente.teste', origem: 'whatsapp', situacao: 'ativo' }, { logradouro: 'Rua das Flores', numero: '120', bairro: 'Centro', cidade: 'São Paulo', uf: 'SP', cep: '01010-000' }],
  ['mercado', { tipoPessoa: 'PJ', nome: 'Mercado Bom Preço Eireli', fantasia: 'Mercado Bom Preço', cpfCnpj: cnpj('223334440001'), whatsapp: '11970000002', origem: 'indicacao', situacao: 'ativo' }, { logradouro: 'Av. Brasil', numero: '1500', bairro: 'Jardim América', cidade: 'São Paulo', uf: 'SP', cep: '01430-000' }],
  ['academia', { tipoPessoa: 'PJ', nome: 'Academia Corpo em Forma', cpfCnpj: cnpj('334445550001'), whatsapp: '11970000003', email: 'financeiro@corpoemforma.teste', origem: 'instagram', situacao: 'ativo' }, null],
  ['escola', { tipoPessoa: 'PJ', nome: 'Escola Pequeno Saber', cpfCnpj: cnpj('445556660001'), telefone: '1133330004', email: 'secretaria@pequenosaber.teste', origem: 'balcao', situacao: 'ativo' }, null],
  ['clinica', { tipoPessoa: 'PJ', nome: 'Clínica Sorriso Odontologia', fantasia: 'Clínica Sorriso', cpfCnpj: cnpj('556667770001'), whatsapp: '11970000005', origem: 'site', situacao: 'ativo' }, { logradouro: 'Rua Augusta', numero: '800', bairro: 'Consolação', cidade: 'São Paulo', uf: 'SP', cep: '01305-000' }],
  ['maria', { tipoPessoa: 'PF', nome: 'Maria Aparecida Souza', cpfCnpj: cpf('123456789'), whatsapp: '11970000006', origem: 'whatsapp' }, null],
  ['joao', { tipoPessoa: 'PF', nome: 'João Pedro Lima', whatsapp: '11970000007', origem: 'balcao' }, null],
  ['autopecas', { tipoPessoa: 'PJ', nome: 'Auto Peças Veloz', cpfCnpj: cnpj('667778880001'), whatsapp: '11970000008', origem: 'indicacao' }, null],
]) {
  // Origens que não existirem nesta versão viram "sem origem"
  const c = await chamar('POST', '/clientes', dados).catch(() => chamar('POST', '/clientes', { ...dados, origem: null }))
  if (endereco) await chamar('POST', `/clientes/${c.id}/enderecos`, endereco).catch((e) => console.warn(`  (endereço não criado: ${e.message})`))
  clientes[chave] = c.id
  console.log(`✔ ${dados.nome}`)
}

console.log('\n— Fornecedores —')
const fornecedores = {}
for (const [chave, dados] of [
  ['lonas', { nome: 'Distribuidora de Lonas SP', cpfCnpj: cnpj('778889990001'), telefone: '1144440001', email: 'vendas@lonas.teste' }],
  ['papel', { nome: 'Papelaria Atacado Central', cpfCnpj: cnpj('889990000001'), telefone: '1144440002' }],
  ['imobiliaria', { nome: 'Imobiliária Centro', telefone: '1144440003' }],
]) {
  fornecedores[chave] = (await chamar('POST', '/fornecedores', dados)).id
  console.log(`✔ ${dados.nome}`)
}

/** Orçamento aprovado e convertido em pedido; devolve o pedido com o total calculado pela API. */
async function pedido(clienteId, itens, conversao) {
  const orc = await chamar('POST', '/orcamentos', { clienteId, itens })
  await chamar('POST', `/orcamentos/${orc.id}/aprovar`, { nome: 'Cliente (teste)' })
  const { pedidoId } = await chamar('POST', `/orcamentos/${orc.id}/converter`, conversao)
  return chamar('GET', `/pedidos/${pedidoId}`)
}
const receber = (p, valor, tipo = 'pix') => chamar('POST', `/financeiro/receber/pedido/${p.id}`, { valorRecebido: Number(valor).toFixed(2), data: hoje, formaPagamentoId: forma(tipo) })
const resumo = async (p, cenario) => {
  const atual = await chamar('GET', `/pedidos/${p.id}`)
  const falta = Number(atual.total) - Number(atual.valorPago)
  if (atual.status === 'cancelado') return console.log(`✔ ${atual.numero} · ${cenario.padEnd(42)} total ${reais(atual.total)} (cancelado)`)
  console.log(`✔ ${atual.numero} · ${cenario.padEnd(42)} total ${reais(atual.total)} · pago ${reais(atual.valorPago)} · falta ${reais(falta)} (${atual.statusFinanceiro})`)
}

console.log('\n— Pedidos (um para cada situação de pagamento) —')
let p = await pedido(clientes.padaria, [{ produtoId: banner, quantidade: 1, largura: '2', altura: '1' }, { produtoId: caneca, quantidade: 10 }], { sinalPercentual: '50', parcelas: 1 })
await resumo(p, 'Nada pago (sinal 50% + 1 parcela)')

p = await pedido(clientes.mercado, [{ produtoId: banner, quantidade: 2, largura: '3', altura: '1' }], { sinalPercentual: '50', parcelas: 2, tipoEntrega: 'instalacao' })
await receber(p, Number(p.total) * 0.3)
await resumo(p, 'Parcial: 30% pago, dentro do sinal')

p = await pedido(clientes.academia, [{ produtoId: adesivo, quantidade: 4, largura: '1.5', altura: '1' }], { sinalPercentual: '40', parcelas: 2 })
await receber(p, Number(p.total) * 0.4, 'dinheiro')
await receber(p, Number(p.total) * 0.15, 'cartao_debito')
await resumo(p, 'Parcial: sinal quitado + parte da 2ª')

p = await pedido(clientes.escola, [{ produtoId: cartao, quantidade: 1000 }], { sinalPercentual: '100', parcelas: 0 })
await receber(p, p.total, 'pix')
await resumo(p, 'Pago à vista (100%)')

p = await pedido(clientes.clinica, [{ produtoId: banner, quantidade: 1, largura: '1.2', altura: '0.8' }, { produtoId: cartao, quantidade: 500 }], { sinalPercentual: '50', parcelas: 1, prioridade: 'urgente' })
await receber(p, 50)
await chamar('PUT', `/pedidos/${p.id}`, { dataPrevistaEntrega: dia(-2), prioridade: 'urgente', tipoEntrega: 'retirada' }).catch((e) => console.warn(`  (não deu para atrasar a entrega: ${e.message})`))
await resumo(p, 'Parcial R$ 50 e entrega atrasada')

p = await pedido(clientes.maria, [{ produtoId: caneca, quantidade: 20 }], { sinalPercentual: '50', parcelas: 1 })
await chamar('POST', `/pedidos/${p.id}/cancelar`, { motivo: 'Cliente desistiu (dado de teste)' })
await resumo(p, 'Cancelado sem pagamento')

console.log('\n— Orçamentos em aberto —')
await chamar('POST', '/orcamentos', { clienteId: clientes.joao, itens: [{ produtoId: caneca, quantidade: 5 }] })
console.log('✔ João Pedro Lima · rascunho')
const enviado = await chamar('POST', '/orcamentos', { clienteId: clientes.autopecas, itens: [{ produtoId: adesivo, quantidade: 2, largura: '2', altura: '0.5' }, { produtoId: cartao, quantidade: 1000 }] })
await chamar('POST', `/orcamentos/${enviado.id}/enviar`)
console.log('✔ Auto Peças Veloz · enviado ao cliente')

console.log('\n— Contas a receber avulsas —')
const [instalacao] = await chamar('POST', '/financeiro/receber', { clienteId: clientes.academia, descricao: 'Serviço de instalação de fachada', valor: '350', vencimento: dia(7) })
await chamar('POST', `/financeiro/receber/${instalacao.id}/baixa`, { valorRecebido: '150', data: hoje, formaPagamentoId: forma('pix') })
console.log('✔ Instalação R$ 350,00 · recebido R$ 150,00 (falta R$ 200,00)')
await chamar('POST', '/financeiro/receber', { clienteId: clientes.joao, descricao: 'Plastificação de documentos', valor: '45', vencimento: dia(-5) })
console.log('✔ Plastificação R$ 45,00 · vencida há 5 dias')

console.log('\n— Contas a pagar —')
await chamar('POST', '/financeiro/pagar', { fornecedorId: fornecedores.imobiliaria, descricao: 'Aluguel do galpão', valor: '2500', vencimento: dia(5) })
console.log('✔ Aluguel R$ 2.500,00 · vence em 5 dias')
await chamar('POST', '/financeiro/pagar', { descricao: 'Conta de energia', valor: '380', vencimento: dia(-3) })
console.log('✔ Energia R$ 380,00 · vencida há 3 dias')
const lona = await chamar('POST', '/financeiro/pagar', { fornecedorId: fornecedores.lonas, descricao: 'Compra de lona 440 g', documento: 'NF 4521', valor: '900', vencimento: dia(-1), parcelas: 3 })
await chamar('POST', `/financeiro/pagar/${lona[0].id}/baixa`, { valorRecebido: lona[0].valor, data: hoje, formaPagamentoId: forma('boleto') })
console.log('✔ Lona R$ 900,00 em 3x · 1ª parcela paga')
const [papel] = await chamar('POST', '/financeiro/pagar', { fornecedorId: fornecedores.papel, descricao: 'Papel couché 300 g', documento: 'NF 887', valor: '640', vencimento: dia(10) })
await chamar('POST', `/financeiro/pagar/${papel.id}/baixa`, { valorRecebido: '240', data: hoje, formaPagamentoId: forma('pix') })
console.log('✔ Papel R$ 640,00 · pago R$ 240,00 (falta R$ 400,00)')

console.log('\nPronto. Abra o kanban de pedidos e as contas a receber/pagar para conferir.')
