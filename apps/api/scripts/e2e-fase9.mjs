// Teste ponta a ponta da Fase 9 (multiempresa) num banco DESCARTÁVEL recém-criado com seed.
// Critério de aceite: duas empresas no mesmo sistema não enxergam nem alteram os dados uma da outra.
import { spawnSync } from 'node:child_process'
import { io } from 'socket.io-client'
import { BASE, chamar, conferir, entrar, finalizar } from './e2e-util.mjs'

const ORIGEM = BASE.replace('/api/v1', '')
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

console.log('— Empresa nova pela linha de comando —')
const criacao = spawnSync('npx', ['tsx', 'prisma/criar-empresa.ts', '--nome', 'Gráfica Concorrente Ltda', '--email', 'dono@concorrente.local', '--senha', 'Inicial123', '--exemplos'], {
  cwd: 'apps/api',
  encoding: 'utf8',
})
conferir('empresa criada (schema, migrations, seed e admin)', criacao.status, 0)
if (criacao.status !== 0) console.log(criacao.stdout, criacao.stderr)
const repetida = spawnSync('npx', ['tsx', 'prisma/criar-empresa.ts', '--nome', 'Outra', '--email', 'dono@concorrente.local', '--senha', 'Inicial123'], { cwd: 'apps/api', encoding: 'utf8' })
conferir('e-mail de admin já usado é recusado', repetida.status, 1)

const a = await entrar('admin@onprint.local', 'admin123', 'Admin12345')
const b = await entrar('dono@concorrente.local', 'Inicial123', 'Concorrente123')
const meA = (await chamar('GET', '/auth/me', { token: a })).json
const meB = (await chamar('GET', '/auth/me', { token: b })).json
conferir('login pelo e-mail encontra a empresa A', meA.empresa.slug, 'principal')
conferir('login pelo e-mail encontra a empresa B', meB.empresa.slug, 'grafica-concorrente-ltda')

console.log('\n— Dados separados —')
const cliA = await chamar('POST', '/clientes', { token: a, body: { nome: 'Padaria da Esquina', whatsapp: '11955554444' } })
const cliB = await chamar('POST', '/clientes', { token: b, body: { nome: 'Padaria da Esquina (B)', whatsapp: '11955554444' } })
conferir('mesmo WhatsApp em empresas diferentes é permitido', `${cliA.status} ${cliB.status}`, '201 201')
conferir('B não lista clientes de A', (await chamar('GET', '/clientes?busca=Esquina', { token: b })).json.data.map((c) => c.nome).join(','), 'Padaria da Esquina (B)')
conferir('B não abre cliente de A pelo id', (await chamar('GET', `/clientes/${cliA.json.id}`, { token: b })).status, 404)
conferir('B não edita cliente de A pelo id', (await chamar('PUT', `/clientes/${cliA.json.id}`, { token: b, body: { nome: 'Invadido', whatsapp: '11955554444' } })).status, 404)
conferir('cliente de A continua intacto', (await chamar('GET', `/clientes/${cliA.json.id}`, { token: a })).json.nome, 'Padaria da Esquina')

const catA = (await chamar('GET', '/orcamentos/catalogo', { token: a })).json
const catB = (await chamar('GET', '/orcamentos/catalogo', { token: b })).json
const caneca = (cat) => cat.find((p) => p.nome.startsWith('Caneca')).id
const orcA = (await chamar('POST', '/orcamentos', { token: a, body: { clienteId: cliA.json.id, itens: [{ produtoId: caneca(catA), quantidade: 10 }] } })).json
const orcB = (await chamar('POST', '/orcamentos', { token: b, body: { clienteId: cliB.json.id, itens: [{ produtoId: caneca(catB), quantidade: 10 }] } })).json
conferir('numeração própria em cada empresa (SQL direto no schema certo)', `${orcA.numero} ${orcB.numero}`.replace(/-\d{4}-/g, '-'), 'ORC-0001 ORC-0001')
conferir('B não usa produto de A no orçamento', (await chamar('POST', '/orcamentos', { token: b, body: { clienteId: cliB.json.id, itens: [{ produtoId: caneca(catA), quantidade: 1 }] } })).status, [404, 422])

console.log('\n— Usuários e e-mail único na plataforma —')
const matrizA = (await chamar('GET', '/permissoes', { token: a })).json
const vendedorA = matrizA.papeis.find((p) => p.codigo === 'vendedor').id
conferir('A não cria usuário com e-mail que já é de B', (await chamar('POST', '/usuarios', { token: a, body: { nome: 'Intruso', email: 'dono@concorrente.local', papelId: vendedorA, senhaProvisoria: 'provisoria1' } })).status, 409)
const vera = await chamar('POST', '/usuarios', { token: a, body: { nome: 'Vera Vendedora', email: 'vera@onprint.local', papelId: vendedorA, senhaProvisoria: 'provisoria1' } })
conferir('A cria usuário com e-mail novo', vera.status, 201)
const tokenVera = await entrar('vera@onprint.local', 'provisoria1', 'Vendedora123')
conferir('usuário novo entra direto na empresa A', (await chamar('GET', '/auth/me', { token: tokenVera })).json.empresa.slug, 'principal')
const editado = await chamar('PUT', `/usuarios/${vera.json.id}`, { token: a, body: { nome: 'Vera Vendedora', email: 'vera.nova@onprint.local', papelId: vendedorA, ativo: true } })
conferir('troca de e-mail do usuário', editado.status, 200)
conferir('entra com o e-mail novo', (await chamar('POST', '/auth/login', { body: { email: 'vera.nova@onprint.local', senha: 'Vendedora123' } })).status, 200)
conferir('o e-mail antigo deixa de entrar', (await chamar('POST', '/auth/login', { body: { email: 'vera@onprint.local', senha: 'Vendedora123' } })).status, 401)

console.log('\n— Sessão (refresh) volta para a empresa certa —')
const login = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dono@concorrente.local', senha: 'Concorrente123' }) })
const cookie = login.headers.get('set-cookie')?.split(';')[0]
const renovado = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { cookie } })
conferir('refresh devolve o usuário da empresa B', (await renovado.json()).usuario?.empresa?.slug, 'grafica-concorrente-ltda')

console.log('\n— Links públicos —')
const tokenA = (await chamar('GET', `/orcamentos/${orcA.id}`, { token: a })).json.tokenPublico
conferir('link de A pelo slug de A', (await chamar('GET', `/publico/principal/orcamentos/${tokenA}`)).status, 200)
conferir('link de A com o slug de B não abre', (await chamar('GET', `/publico/grafica-concorrente-ltda/orcamentos/${tokenA}`)).status, 404)
conferir('slug inexistente', (await chamar('GET', `/publico/nao-existe/orcamentos/${tokenA}`)).status, 404)

console.log('\n— Arquivos —')
const form = new FormData()
form.append('arquivo', new Blob(['%PDF-1.4 teste']), 'contrato.pdf')
const up = await chamar('POST', `/arquivos?entidade=cliente&entidadeId=${cliA.json.id}`, { token: a, form })
conferir('upload na empresa A', up.status, 201)
conferir('B não baixa arquivo de A pelo id', (await chamar('GET', `/arquivos/${up.json.id}`, { token: b })).status, 404)
const url = (await chamar('GET', `/arquivos/${up.json.id}/url`, { token: a })).json.url
conferir('URL temporária de A funciona', (await fetch(ORIGEM + url)).status, 200)
const adulterada = url.replace(meA.empresa.id, meB.empresa.id)
conferir('trocar a empresa na URL invalida a assinatura', (await fetch(ORIGEM + adulterada)).status, 404)

console.log('\n— Tempo real só dentro da empresa —')
const conectar = (token) =>
  new Promise((resolve, reject) => {
    const s = io(ORIGEM, { path: '/socket.io', auth: { token }, transports: ['websocket'] })
    s.on('connect', () => resolve(s))
    s.on('connect_error', reject)
  })
const [socketA, socketB] = await Promise.all([conectar(a), conectar(b)])
const eventos = { a: 0, b: 0 }
socketA.on('pedido:atualizado', () => eventos.a++)
socketB.on('pedido:atualizado', () => eventos.b++)
await espera(300)
await chamar('POST', `/orcamentos/${orcA.id}/aprovar`, { token: a, body: { nome: 'Cliente' } })
await chamar('POST', `/orcamentos/${orcA.id}/converter`, { token: a, body: { sinalPercentual: '50', parcelas: 1 } })
await espera(500)
conferir('pedido de A avisa a empresa A', eventos.a > 0, true)
conferir('pedido de A NÃO chega à empresa B', eventos.b, 0)
socketA.close()
socketB.close()
conferir('B não vê o pedido de A', (await chamar('GET', '/pedidos', { token: b })).json.data.length, 0)

finalizar()
