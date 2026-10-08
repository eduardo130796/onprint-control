// Teste ponta a ponta da Fase 12 (Asaas) num banco DESCARTÁVEL recém-criado com seed.
// Um servidor falso do Asaas (porta 3399) recebe as chamadas da API; os webhooks são enviados pelo teste.
// A API temporária roda com ASAAS_API_URL=http://127.0.0.1:3399/v3, ASAAS_API_KEY=chave-teste e NFS-e ligada.
// Critério de aceite: assinar → cobrança → pagamento confirma a assinatura → atraso bloqueia → pagamento libera,
// com nota fiscal, troca de plano/forma, cancelamento, avisos duplicados ignorados e conferência diária.
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { chamar, conferir, entrar, finalizar } from './e2e-util.mjs'

const TOKEN_WEBHOOK = 'token-de-webhook-de-teste-com-32-caracteres-ok'
const ENV_ASAAS = { ASAAS_API_KEY: 'chave-teste', ASAAS_API_URL: 'http://127.0.0.1:3399/v3', ASAAS_WEBHOOK_TOKEN: TOKEN_WEBHOOK, ASAAS_NF_ATIVA: 'true', ASAAS_NF_SERVICO_CODIGO: '01.07', ASAAS_NF_ISS: '2' }
const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
const dia = (n) => new Date(Date.parse(`${hoje}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10)

// ─── Asaas falso ───
const asaas = { clientes: [], assinaturas: new Map(), cobrancas: new Map(), notas: [], configNotas: [], autorizacoes: new Map(), chamadas: [], seq: 0 }
const novoId = (p) => `${p}_${++asaas.seq}`
function novaCobranca(sub, dueDate) {
  const p = { object: 'payment', id: novoId('pay'), customer: sub.customer, subscription: sub.id, value: sub.value, dueDate, status: 'PENDING', billingType: sub.billingType, invoiceUrl: `https://sandbox.asaas.com/i/${asaas.seq}`, deleted: false }
  asaas.cobrancas.set(p.id, p)
  return p
}
const servidor = createServer(async (req, res) => {
  let corpo = ''
  for await (const parte of req) corpo += parte
  const json = corpo ? JSON.parse(corpo) : {}
  const url = new URL(req.url, 'http://x')
  const caminho = url.pathname.replace('/v3', '')
  asaas.chamadas.push(`${req.method} ${caminho}`)
  const responder = (status, dados) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(dados))
  }
  if (req.headers.access_token !== 'chave-teste') return responder(401, { errors: [{ description: 'Chave inválida' }] })
  let m
  if (req.method === 'POST' && caminho === '/customers') {
    if (!/^\d{11}(\d{3})?$/.test(json.cpfCnpj ?? '')) return responder(400, { errors: [{ description: 'CPF/CNPJ inválido' }] })
    const c = { id: novoId('cus'), ...json }
    asaas.clientes.push(c)
    return responder(200, c)
  }
  if (req.method === 'POST' && caminho === '/subscriptions') {
    const s = { id: novoId('sub'), ...json, deleted: false }
    asaas.assinaturas.set(s.id, s)
    novaCobranca(s, json.nextDueDate)
    return responder(200, s)
  }
  if ((m = caminho.match(/^\/subscriptions\/([\w]+)\/payments$/))) return responder(200, { object: 'list', data: [...asaas.cobrancas.values()].filter((p) => p.subscription === m[1]), hasMore: false })
  if ((m = caminho.match(/^\/subscriptions\/([\w]+)\/invoiceSettings$/))) {
    asaas.configNotas.push({ assinatura: m[1], ...json })
    return responder(200, json)
  }
  if ((m = caminho.match(/^\/subscriptions\/([\w]+)$/))) {
    const s = asaas.assinaturas.get(m[1])
    if (!s) return responder(404, { errors: [{ description: 'Assinatura não encontrada' }] })
    if (req.method === 'PUT') {
      Object.assign(s, json.value ? { value: json.value } : {}, json.billingType ? { billingType: json.billingType } : {})
      if (json.updatePendingPayments) for (const p of asaas.cobrancas.values()) if (p.subscription === s.id && p.status === 'PENDING') Object.assign(p, { value: s.value, billingType: s.billingType })
      return responder(200, s)
    }
    if (req.method === 'DELETE') {
      s.deleted = true
      for (const p of asaas.cobrancas.values()) if (p.subscription === s.id && ['PENDING', 'OVERDUE'].includes(p.status)) p.deleted = true
      return responder(200, { deleted: true, id: s.id })
    }
  }
  if (req.method === 'GET' && caminho === '/payments') return responder(200, { data: [...asaas.cobrancas.values()].filter((p) => p.customer === url.searchParams.get('customer')), hasMore: false })
  if (req.method === 'POST' && caminho === '/pix/automatic/authorizations') {
    const aut = { id: novoId('pa'), status: 'CREATED', ...json, payload: `00020126PIXAUTOMATICO${asaas.seq}`, encodedImage: 'iVBORw0KGgo=', immediateQrCode: { ...json.immediateQrCode, expirationDate: '2026-12-31 23:59:00' } }
    asaas.autorizacoes.set(aut.id, aut)
    // 1ª mensalidade: cobrança imediata do cliente, ainda sem assinatura
    const p = { object: 'payment', id: novoId('pay'), customer: json.customerId, subscription: null, value: json.immediateQrCode.originalValue, dueDate: hoje, status: 'PENDING', billingType: 'PIX', deleted: false }
    asaas.cobrancas.set(p.id, p)
    aut.primeiraCobranca = p.id
    return responder(200, aut)
  }
  if ((m = caminho.match(/^\/pix\/automatic\/authorizations\/([\w]+)$/))) {
    const aut = asaas.autorizacoes.get(m[1])
    if (!aut) return responder(404, { errors: [{ description: 'Autorização não encontrada' }] })
    if (req.method === 'DELETE') aut.status = 'CANCELLED'
    return responder(200, aut)
  }
  if (caminho === '/invoices') return responder(200, { data: asaas.notas.filter((n) => n.payment === url.searchParams.get('payment')) })
  responder(404, { errors: [{ description: `Rota falsa não implementada: ${req.method} ${caminho}` }] })
})
await new Promise((r) => servidor.listen(3399, '127.0.0.1', r))

// ─── Ajudantes ───
let evento = 0
const webhook = (event, dados, id = `evt_${++evento}`) => chamar('POST', '/plataforma/webhooks/asaas', { body: { id, event, dateCreated: `${hoje} 10:00:00`, ...dados }, headers: { 'asaas-access-token': TOKEN_WEBHOOK } })
const cli = (script, args) => spawnSync('npx', ['tsx', `prisma/${script}.ts`, ...args], { cwd: 'apps/api', encoding: 'utf8', env: { ...process.env, ...ENV_ASAAS } })
/** Comando que chama o Asaas falso: precisa ser assíncrono (spawnSync travaria este processo, que serve o Asaas falso) */
const cliAssincrono = (script, args) =>
  new Promise((resolve) => {
    const p = spawn('npx', ['tsx', `prisma/${script}.ts`, ...args], { cwd: 'apps/api', env: { ...process.env, ...ENV_ASAAS } })
    let saida = ''
    p.stdout.on('data', (d) => (saida += d))
    p.stderr.on('data', (d) => (saida += d))
    p.on('close', (status) => resolve({ status, saida }))
  })

conferir('empresa B em teste (Essencial)', cli('criar-empresa', ['--nome', 'Gráfica Assinante', '--email', 'dono@assinante.local', '--senha', 'Inicial123', '--plano', 'essencial', '--exemplos']).status, 0)
const b = await entrar('dono@assinante.local', 'Inicial123', 'Assinante123')
const minha = async () => (await chamar('GET', '/assinatura', { token: b })).json
const acesso = async () => (await chamar('GET', '/auth/me', { token: b })).json.assinatura

console.log('— Antes de assinar —')
let a = await minha()
conferir('pagamento online disponível e admin pode gerenciar', `${a.pagamentoOnline} ${a.podeGerenciar} ${a.assinadaOnline}`, 'true true false')
const papeis = (await chamar('GET', '/permissoes', { token: b })).json.papeis
await chamar('POST', '/usuarios', { token: b, body: { nome: 'Vendedor', email: 'vend@assinante.local', papelId: papeis.find((p) => p.codigo === 'vendedor').id, senhaProvisoria: 'provisoria1' } })
const vendedor = await entrar('vend@assinante.local', 'provisoria1', 'Vendedor123')
conferir('vendedor vê a assinatura, mas não gerencia', (await chamar('GET', '/assinatura', { token: vendedor })).json.podeGerenciar, false)
conferir('vendedor não assina', (await chamar('POST', '/assinatura/assinar', { token: vendedor, body: { plano: 'profissional', forma: 'pix_boleto', cpfCnpj: '11.222.333/0001-81' } })).status, 403)
conferir('CNPJ inválido é recusado antes do Asaas', (await chamar('POST', '/assinatura/assinar', { token: b, body: { plano: 'profissional', forma: 'pix_boleto', cpfCnpj: '11.111.111/1111-11' } })).status, 400)

console.log('\n— Assinar (Profissional, PIX/boleto) —')
let r = await chamar('POST', '/assinatura/assinar', { token: b, body: { plano: 'profissional', forma: 'pix_boleto', cpfCnpj: '11.222.333/0001-81' } })
conferir('assinatura criada com link da 1ª cobrança', `${r.status} ${r.json.linkPagamento?.startsWith('https://sandbox.asaas.com/i/')}`, '200 true')
const sub = [...asaas.assinaturas.values()][0]
conferir('Asaas: cliente com CNPJ e referência da empresa', `${asaas.clientes[0]?.cpfCnpj} ${Boolean(asaas.clientes[0]?.externalReference)}`, '11222333000181 true')
conferir('Asaas: mensal, R$ 279, cliente escolhe a forma', `${sub.cycle} ${sub.value} ${sub.billingType}`, 'MONTHLY 279 UNDEFINED')
conferir('1ª cobrança vence no fim do teste (não perde dias grátis)', sub.nextDueDate, dia(14))
conferir('NFS-e configurada: após o pagamento, serviço e ISS', `${asaas.configNotas[0]?.effectiveDatePeriod} ${asaas.configNotas[0]?.municipalServiceCode} ${asaas.configNotas[0]?.taxes?.iss}`, 'ON_PAYMENT_CONFIRMATION 01.07 2')
a = await minha()
conferir('tela: assinada online, plano novo, cobrança em aberto', `${a.assinadaOnline} ${a.plano.nome} ${a.cobrancaAberta?.vencimento} ${a.situacao}`, `true Profissional ${dia(14)} teste`)
conferir('não assina duas vezes', (await chamar('POST', '/assinatura/assinar', { token: b, body: { plano: 'profissional', forma: 'pix_boleto', cpfCnpj: '11222333000181' } })).status, 409)

console.log('\n— Webhook: pagamento —')
const pay1 = [...asaas.cobrancas.values()][0]
conferir('sem o token, recusado', (await chamar('POST', '/plataforma/webhooks/asaas', { body: { id: 'evt_x', event: 'PAYMENT_RECEIVED', payment: pay1 } })).status, 401)
Object.assign(pay1, { status: 'RECEIVED', billingType: 'PIX', paymentDate: hoje, clientPaymentDate: hoje })
r = await webhook('PAYMENT_RECEIVED', { payment: pay1 }, 'evt_pago_1')
conferir('pagamento processado', `${r.status} ${r.json.situacao}`, '200 processado')
a = await minha()
conferir('1º pagamento: teste vira assinatura ativa', `${a.situacao} ${a.acesso.motivo}`, 'ativa em_dia')
conferir('mensalidade paga por PIX no histórico', `${a.cobrancas[0]?.situacao} ${a.cobrancas[0]?.forma}`, 'paga PIX')
r = await webhook('PAYMENT_RECEIVED', { payment: pay1 }, 'evt_pago_1')
conferir('mesmo aviso de novo: ignorado (idempotente)', r.json.situacao, 'duplicado')
r = await webhook('INVOICE_AUTHORIZED', { invoice: { object: 'invoice', id: 'inv_1', payment: pay1.id, status: 'AUTHORIZED', number: '4521', pdfUrl: 'https://sandbox.asaas.com/nf/4521.pdf' } })
a = await minha()
conferir('nota fiscal emitida aparece na mensalidade', `${a.cobrancas[0]?.notaFiscal?.situacao} ${a.cobrancas[0]?.notaFiscal?.numero}`, 'emitida 4521')

console.log('\n— Atraso, cartão recusado e pagamento —')
const pay2 = novaCobranca(sub, dia(-6))
await webhook('PAYMENT_CREATED', { payment: pay2 })
pay2.status = 'OVERDUE'
await webhook('PAYMENT_OVERDUE', { payment: pay2 })
let s = await acesso()
conferir('mensalidade vencida há 6 dias: só leitura', `${s.nivel} ${s.diasAtraso}`, 'somente_leitura 6')
conferir('só leitura: não grava', (await chamar('POST', '/clientes', { token: b, body: { nome: 'Novo', email: 'novo@x.local' } })).status, 403)
conferir('só leitura: "Minha assinatura" mostra o link para pagar', Boolean((await minha()).cobrancaAberta?.linkPagamento), true)
await webhook('PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', { payment: { ...pay2, billingType: 'CREDIT_CARD' } })
conferir('recusa do cartão aparece na cobrança', (await minha()).cobrancaAberta?.falha, 'Cartão recusado pela operadora')
Object.assign(pay2, { status: 'CONFIRMED', billingType: 'CREDIT_CARD', confirmedDate: hoje })
await webhook('PAYMENT_CONFIRMED', { payment: pay2 })
s = await acesso()
conferir('pagou: volta ao normal na hora', `${s.nivel} ${s.motivo}`, 'normal em_dia')
conferir('grava de novo', (await chamar('POST', '/clientes', { token: b, body: { nome: 'Depois do pagamento', email: 'depois@x.local' } })).status, 201)
r = await webhook('PAYMENT_RECEIVED', { payment: { id: 'pay_alheio', subscription: 'sub_nao_existe', value: 10, dueDate: hoje, status: 'RECEIVED' } })
conferir('aviso de assinatura desconhecida: 200, guardado com erro', `${r.status} ${r.json.situacao}`, '200 erro')

console.log('\n— Trocar plano e forma —')
const pay3 = novaCobranca(sub, dia(30))
await webhook('PAYMENT_CREATED', { payment: pay3 })
r = await chamar('POST', '/assinatura/plano', { token: b, body: { plano: 'completo' } })
conferir('plano trocado para Completo', r.status, 200)
conferir('Asaas: valor novo na assinatura e na cobrança em aberto', `${sub.value} ${pay3.value}`, '449 449')
conferir('módulo do plano novo liberado (estoque)', (await chamar('GET', '/estoque/locais', { token: b })).status, 200)
r = await chamar('POST', '/assinatura/forma', { token: b, body: { forma: 'cartao' } })
conferir('forma: cartão automático no Asaas', `${r.status} ${sub.billingType}`, '200 CREDIT_CARD')
conferir('trocar para o plano atual é recusado', (await chamar('POST', '/assinatura/plano', { token: b, body: { plano: 'completo' } })).status, 422)

console.log('\n— Conferência diária (aviso perdido) —')
Object.assign(pay3, { status: 'RECEIVED', billingType: 'CREDIT_CARD', paymentDate: dia(0) })
asaas.notas.push({ id: 'inv_3', payment: pay3.id, status: 'AUTHORIZED', number: '4600', pdfUrl: 'https://sandbox.asaas.com/nf/4600.pdf' })
const conf = await cliAssincrono('assinatura', ['--conciliar'])
if (conf.status !== 0 || conf.saida.includes('Falha')) console.log(conf.saida)
conferir('conferência roda pela linha de comando', conf.status, 0)
a = await minha()
const c3 = a.cobrancas.find((c) => c.vencimento === dia(30))
conferir('pagamento sem webhook encontrado na conferência, com a nota', `${c3?.situacao} ${c3?.notaFiscal?.numero}`, 'paga 4600')

console.log('\n— Cancelar e assinar de novo —')
const fimPeriodo = new Date(Date.parse(`${dia(30)}T12:00:00Z`))
fimPeriodo.setUTCMonth(fimPeriodo.getUTCMonth() + 1)
r = await chamar('POST', '/assinatura/cancelar', { token: b })
conferir('cancelado: acesso até o fim do período pago (1 mês após a última mensalidade)', `${r.status} ${r.json.cancelarEm}`, `200 ${fimPeriodo.toISOString().slice(0, 10)}`)
conferir('Asaas: recorrência removida', sub.deleted, true)
a = await minha()
conferir('tela: sem assinatura online, com data de fim', `${a.assinadaOnline} ${Boolean(a.cancelarEm)} ${(await acesso()).nivel}`, 'false true normal')
conferir('não cancela duas vezes', (await chamar('POST', '/assinatura/cancelar', { token: b })).status, 422)
r = await chamar('POST', '/assinatura/assinar', { token: b, body: { plano: 'completo', forma: 'cartao', cpfCnpj: '11222333000181' } })
conferir('assina de novo (reaproveita o cliente do Asaas)', `${r.status} ${asaas.clientes.length} ${asaas.assinaturas.size}`, '200 1 2')
conferir('cancelamento desfeito', (await minha()).cancelarEm, null)

console.log('\n— PIX Automático —')
conferir('empresa P em teste', cli('criar-empresa', ['--nome', 'Gráfica Pix', '--email', 'dono@pix.local', '--senha', 'Inicial123', '--plano', 'essencial']).status, 0)
const px = await entrar('dono@pix.local', 'Inicial123', 'Pix12345678')
conferir('PIX Automático oferecido (liberado na conta)', (await chamar('GET', '/assinatura', { token: px })).json.formasDisponiveis.join(','), 'pix_automatico,cartao,pix_boleto')
r = await chamar('POST', '/assinatura/assinar', { token: px, body: { plano: 'essencial', forma: 'pix_automatico', cpfCnpj: '11.444.777/0001-61' } })
conferir('assinar com PIX Automático gera a autorização', r.status, 200)
const aut = [...asaas.autorizacoes.values()].at(-1)
conferir('Asaas: autorização mensal que vira assinatura, com valor e 1ª cobrança imediata', `${aut.frequency} ${aut.paymentCreationMode} ${aut.value} ${aut.immediateQrCode.originalValue}`, 'MONTHLY SUBSCRIPTION 149 149')
let ap = (await chamar('GET', '/assinatura', { token: px })).json
conferir('tela: QR Code e copia e cola aguardando', `${ap.assinadaOnline} ${ap.formaPagamento} ${ap.pixAutomatico?.copiaECola.startsWith('00020126PIXAUTOMATICO')} ${Boolean(ap.pixAutomatico?.imagem)}`, 'true pix_automatico true true')
conferir('não troca para cartão (é autorização no banco)', (await chamar('POST', '/assinatura/forma', { token: px, body: { forma: 'cartao' } })).status, 422)
const primeiraPix = asaas.cobrancas.get(aut.primeiraCobranca)
Object.assign(primeiraPix, { status: 'RECEIVED', paymentDate: hoje })
await webhook('PAYMENT_RECEIVED', { payment: primeiraPix })
conferir('1ª mensalidade (sem assinatura ainda) reconhecida pelo cliente: ativa', (await chamar('GET', '/assinatura', { token: px })).json.situacao, 'ativa')
r = await webhook('PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED', { authorization: { id: aut.id, status: 'ACTIVE', subscriptionId: 'sub_pix_1', customerId: aut.customerId } })
ap = (await chamar('GET', '/assinatura', { token: px })).json
conferir('banco autorizou: QR some, débito automático ativo', `${r.json.situacao} ${ap.pixAutomatico} ${ap.assinadaOnline}`, 'processado null true')
conferir('QR novo só com autorização pendente', (await chamar('POST', '/assinatura/pix-automatico/novo-qr', { token: px })).status, 422)
r = await chamar('POST', '/assinatura/cancelar', { token: px })
conferir('cancelar encerra a autorização no Asaas', `${r.status} ${aut.status}`, '200 CANCELLED')

conferir('empresa Q em teste', cli('criar-empresa', ['--nome', 'Gráfica Recusa', '--email', 'dono@recusa.local', '--senha', 'Inicial123']).status, 0)
const pq = await entrar('dono@recusa.local', 'Inicial123', 'Recusa12345')
await chamar('POST', '/assinatura/assinar', { token: pq, body: { plano: 'essencial', forma: 'pix_automatico', cpfCnpj: '11.444.777/0001-61' } })
const autQ = [...asaas.autorizacoes.values()].at(-1)
r = await chamar('POST', '/assinatura/pix-automatico/novo-qr', { token: pq })
const autQ2 = [...asaas.autorizacoes.values()].at(-1)
conferir('QR novo: encerra a autorização anterior e cria outra', `${r.status} ${autQ.status} ${autQ2.id !== autQ.id}`, '200 CANCELLED true')
await webhook('PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED', { authorization: { id: autQ2.id, status: 'REFUSED' } })
ap = (await chamar('GET', '/assinatura', { token: pq })).json
conferir('recusada no banco: libera para assinar de novo', `${ap.assinadaOnline} ${ap.pixAutomatico}`, 'false null')

console.log('\n— Modo manual (empresa sem pagamento online) —')
cli('criar-empresa', ['--nome', 'Gráfica Manual', '--email', 'dono@manual.local', '--senha', 'Inicial123', '--ativa'])
const c = await entrar('dono@manual.local', 'Inicial123', 'Manual12345')
conferir('cobrança manual vencida há 20 dias', cli('assinatura', ['--empresa', 'grafica-manual', '--cobranca-manual', dia(-20)]).status, 0)
conferir('bloqueada pelo atraso', (await chamar('GET', '/auth/me', { token: c })).json.assinatura.nivel, 'bloqueado')
cli('assinatura', ['--empresa', 'grafica-manual', '--registrar-pagamento'])
conferir('pagamento registrado pelo suporte libera', (await chamar('GET', '/auth/me', { token: c })).json.assinatura.nivel, 'normal')

conferir('chamadas ao Asaas sempre com a chave (nenhuma recusada)', asaas.chamadas.length > 5, true)
servidor.close()
finalizar()
