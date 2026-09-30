// Teste ponta a ponta da Fase 1 contra uma API rodando num banco DESCARTÁVEL (recém-criado com seed).
// Uso (dentro do container da API): node apps/api/scripts/e2e-fase1.mjs http://127.0.0.1:3334/api/v1
import { BASE, chamar, conferir, entrar, finalizar } from './e2e-util.mjs'

const admin = await entrar('admin@onprint.local', 'admin123', 'Admin12345')
const matriz = await chamar('GET', '/permissoes', { token: admin })
conferir('admin: GET /permissoes', matriz.status, 200)
const papel = (codigo) => matriz.json.papeis.find((p) => p.codigo === codigo).id

console.log('\n— Usuários (admin) —')
const novo = await chamar('POST', '/usuarios', {
  token: admin,
  body: { nome: 'Vera Vendedora', email: 'vera@onprint.local', papelId: papel('vendedor'), senhaProvisoria: 'provisoria1', comissaoPercentual: '5' },
})
conferir('criar vendedor', novo.status, 201)
conferir('e-mail duplicado', (await chamar('POST', '/usuarios', { token: admin, body: { nome: 'Xavier', email: 'vera@onprint.local', papelId: papel('vendedor'), senhaProvisoria: 'provisoria1' } })).status, 409)
conferir('admin não pode se desativar', (await chamar('DELETE', `/usuarios/${JSON.parse(Buffer.from(admin.split('.')[1], 'base64url')).sub}`, { token: admin })).status, 422)

const semTroca = await chamar('POST', '/auth/login', { body: { email: 'vera@onprint.local', senha: 'provisoria1' } })
conferir('vendedor com troca pendente: GET /clientes', (await chamar('GET', '/clientes', { token: semTroca.json.accessToken })).status, 403)
const vend = await entrar('vera@onprint.local', 'provisoria1', 'Vendedora123')

console.log('\n— CRITÉRIO DE ACEITE: vendedor em Configurações pela API (403) —')
const bloqueadas = [
  ['GET', '/usuarios'],
  ['POST', '/usuarios', {}],
  ['GET', '/permissoes'],
  ['PUT', `/permissoes/papeis/${papel('vendedor')}`, { permissoes: [] }],
  ['PUT', '/empresa', {}],
  ['POST', '/templates', {}],
  ['PUT', `/status/${'0'.repeat(8)}-0000-4000-a000-${'0'.repeat(12)}`, {}],
  ['DELETE', `/templates/${'0'.repeat(8)}-0000-4000-a000-${'0'.repeat(12)}`],
  ['GET', '/fornecedores'],
]
for (const [m, c, body] of bloqueadas) conferir(`vendedor ${m} ${c}`, (await chamar(m, c, { token: vend, body })).status, 403)

console.log('\n— Clientes (vendedor) —')
const cli = await chamar('POST', '/clientes', { token: vend, body: { nome: 'Padaria Pão Quente', whatsapp: '(11) 98888-7777', origem: 'whatsapp' } })
conferir('pré-cadastro', cli.status, 201)
conferir('situação inicial', cli.json.situacao, 'pre_cadastro')
conferir('whatsapp duplicado', (await chamar('POST', '/clientes', { token: vend, body: { nome: 'Outro', whatsapp: '11988887777' } })).status, 409)
conferir('CPF inválido', (await chamar('POST', '/clientes', { token: vend, body: { nome: 'Outro', email: 'a@b.com', cpfCnpj: '111.111.111-11' } })).status, 400)
conferir('busca por dígitos do WhatsApp', (await chamar('GET', '/clientes?busca=98888', { token: vend })).json.meta.total, 1)
conferir('adicionar endereço', (await chamar('POST', `/clientes/${cli.json.id}/enderecos`, { token: vend, body: { logradouro: 'Rua A', cidade: 'São Paulo', uf: 'sp', cep: '01310-100' } })).status, 201)
conferir('vendedor não exclui cliente', (await chamar('DELETE', `/clientes/${cli.json.id}`, { token: vend })).status, 403)
conferir('leitura de status/templates/empresa', (await Promise.all(['/status', '/templates', '/empresa'].map((c) => chamar('GET', c, { token: vend })))).map((r) => r.status).join(','), '200,200,200')

console.log('\n— Permissões dinâmicas —')
const semClientes = matriz.json.concedidas[papel('vendedor')].filter((p) => !p.startsWith('clientes:'))
conferir('admin remove clientes do vendedor', (await chamar('PUT', `/permissoes/papeis/${papel('vendedor')}`, { token: admin, body: { permissoes: semClientes } })).status, 200)
conferir('vendedor perde acesso na hora (cache invalidado)', (await chamar('GET', '/clientes', { token: vend })).status, 403)
conferir('admin é fixo', (await chamar('PUT', `/permissoes/papeis/${papel('admin')}`, { token: admin, body: { permissoes: [] } })).status, 422)

console.log('\n— Arquivos (admin) —')
const form = new FormData()
form.append('arquivo', new Blob(['%PDF-1.4 teste']), 'orçamento assinado.pdf')
const up = await chamar('POST', `/arquivos?entidade=cliente&entidadeId=${cli.json.id}`, { token: admin, form })
conferir('upload de anexo', up.status, 201)
const ruim = new FormData()
ruim.append('arquivo', new Blob(['x']), 'virus.exe')
conferir('extensão proibida', (await chamar('POST', `/arquivos?entidade=cliente&entidadeId=${cli.json.id}`, { token: admin, form: ruim })).status, 422)
conferir('download com permissão', (await chamar('GET', `/arquivos/${up.json.id}`, { token: admin })).status, 200)
conferir('vendedor (sem clientes agora) não baixa', (await chamar('GET', `/arquivos/${up.json.id}`, { token: vend })).status, 403)
const url = (await chamar('GET', `/arquivos/${up.json.id}/url`, { token: admin })).json.url
conferir('URL temporária sem login', (await fetch(BASE.replace('/api/v1', '') + url)).status, 200)

finalizar()
