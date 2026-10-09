// Asaas falso para os testes e2e (porta 3399): clientes, assinaturas, cobranças, PIX Automático e notas.
// A API temporária roda com ASAAS_API_URL=http://127.0.0.1:3399/v3 e ASAAS_API_KEY=chave-teste; os webhooks são enviados pelo teste.
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { chamar } from './e2e-util.mjs'

export const TOKEN_WEBHOOK = 'token-de-webhook-de-teste-com-32-caracteres-ok'
export const ENV_ASAAS = { ASAAS_API_KEY: 'chave-teste', ASAAS_API_URL: 'http://127.0.0.1:3399/v3', ASAAS_WEBHOOK_TOKEN: TOKEN_WEBHOOK, ASAAS_NF_ATIVA: 'true', ASAAS_NF_SERVICO_CODIGO: '01.07', ASAAS_NF_ISS: '2' }
export const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
export const dia = (n) => new Date(Date.parse(`${hoje}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10)

// ─── Asaas falso ───
export const asaas = { clientes: [], assinaturas: new Map(), cobrancas: new Map(), notas: [], configNotas: [], autorizacoes: new Map(), chamadas: [], seq: 0 }
const novoId = (p) => `${p}_${++asaas.seq}`
export function novaCobranca(sub, dueDate) {
  const p = { object: 'payment', id: novoId('pay'), customer: sub.customer, subscription: sub.id, value: sub.value, dueDate, status: 'PENDING', billingType: sub.billingType, invoiceUrl: `https://sandbox.asaas.com/i/${asaas.seq}`, deleted: false }
  asaas.cobrancas.set(p.id, p)
  return p
}
export const servidor = createServer(async (req, res) => {
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
      Object.assign(s, json.value ? { value: json.value } : {}, json.billingType ? { billingType: json.billingType } : {}, json.nextDueDate ? { nextDueDate: json.nextDueDate } : {})
      if (json.updatePendingPayments) for (const p of asaas.cobrancas.values()) if (p.subscription === s.id && p.status === 'PENDING') Object.assign(p, { value: s.value, billingType: s.billingType })
      return responder(200, s)
    }
    if (req.method === 'DELETE') {
      s.deleted = true
      for (const p of asaas.cobrancas.values()) if (p.subscription === s.id && ['PENDING', 'OVERDUE'].includes(p.status)) p.deleted = true
      return responder(200, { deleted: true, id: s.id })
    }
  }
  if (req.method === 'POST' && caminho === '/payments') {
    if (json.dueDate < hoje) return responder(400, { errors: [{ description: 'Data de vencimento no passado' }] })
    const p = { object: 'payment', id: novoId('pay'), customer: json.customer, subscription: null, value: json.value, dueDate: json.dueDate, status: 'PENDING', billingType: json.billingType, description: json.description, invoiceUrl: `https://sandbox.asaas.com/i/${asaas.seq}`, deleted: false }
    asaas.cobrancas.set(p.id, p)
    return responder(200, p)
  }
  // A API consulta a cobrança ao receber o aviso (o corpo do webhook é só o gatilho); removida volta com deleted: true
  if (req.method === 'GET' && (m = caminho.match(/^\/payments\/([\w]+)$/))) {
    const p = asaas.cobrancas.get(m[1])
    if (!p) return responder(404, { errors: [{ description: 'Cobrança não encontrada' }] })
    return responder(200, p)
  }
  if (req.method === 'DELETE' && (m = caminho.match(/^\/payments\/([\w]+)$/))) {
    const p = asaas.cobrancas.get(m[1])
    if (!p) return responder(404, { errors: [{ description: 'Cobrança não encontrada' }] })
    if (!['PENDING', 'OVERDUE'].includes(p.status)) return responder(400, { errors: [{ description: 'Só cobranças em aberto podem ser removidas' }] })
    p.deleted = true
    return responder(200, { deleted: true, id: p.id })
  }
  if (req.method === 'PUT' && (m = caminho.match(/^\/payments\/([\w]+)$/))) {
    const p = asaas.cobrancas.get(m[1])
    if (!p) return responder(404, { errors: [{ description: 'Cobrança não encontrada' }] })
    if (json.dueDate < hoje) return responder(400, { errors: [{ description: `A data mínima de vencimento para novas cobranças é ${hoje.split('-').reverse().join('/')}.` }] })
    Object.assign(p, { value: json.value, dueDate: json.dueDate, billingType: json.billingType, status: 'PENDING' })
    return responder(200, p)
  }
  if (req.method === 'GET' && caminho === '/payments') return responder(200, { data: [...asaas.cobrancas.values()].filter((p) => p.customer === url.searchParams.get('customer') && !p.deleted), hasMore: false })
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
/**
 * No Asaas de verdade o aviso chega depois de a mudança existir lá. Como a API consulta o Asaas ao receber
 * o aviso, o teste que manda uma nota ou uma autorização no aviso também a deixa assim no Asaas falso.
 * (Cobranças não: o teste altera o objeto guardado antes do aviso; cobrança desconhecida continua desconhecida.)
 */
function refletirNoAsaas(dados) {
  if (dados.invoice?.id) {
    const { object: _o, ...nota } = dados.invoice
    const atual = asaas.notas.find((n) => n.id === nota.id)
    if (atual) Object.assign(atual, nota)
    else asaas.notas.push(nota)
  }
  const aut = dados.authorization && asaas.autorizacoes.get(dados.authorization.id)
  if (aut) Object.assign(aut, dados.authorization)
}
export const webhook = (event, dados, id = `evt_${++evento}`) => (refletirNoAsaas(dados), chamar('POST', '/plataforma/webhooks/asaas', { body: { id, event, dateCreated: `${hoje} 10:00:00`, ...dados }, headers: { 'asaas-access-token': TOKEN_WEBHOOK } }))
export const cli = (script, args) => spawnSync('npx', ['tsx', `prisma/${script}.ts`, ...args], { cwd: 'apps/api', encoding: 'utf8', env: { ...process.env, ...ENV_ASAAS } })
/** Comando que chama o Asaas falso: precisa ser assíncrono (spawnSync travaria este processo, que serve o Asaas falso) */
export const cliAssincrono = (script, args) =>
  new Promise((resolve) => {
    const p = spawn('npx', ['tsx', `prisma/${script}.ts`, ...args], { cwd: 'apps/api', env: { ...process.env, ...ENV_ASAAS } })
    let saida = ''
    p.stdout.on('data', (d) => (saida += d))
    p.stderr.on('data', (d) => (saida += d))
    p.on('close', (status) => resolve({ status, saida }))
  })

