// Teste ponta a ponta da Fase 10 (e-mail e recuperação de senha) num banco DESCARTÁVEL recém-criado com seed.
// A API temporária grava cada e-mail em JSON em EMAIL_PASTA (o runner usa /tmp/e2e-emails).
// Critério de aceite: "esqueci a senha" e convite funcionam pelo link do e-mail, uma vez só, sem revelar contas.
import { spawnSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BASE, chamar, conferir, entrar, finalizar } from './e2e-util.mjs'

const PASTA = process.env.EMAIL_PASTA ?? '/tmp/e2e-emails'
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

async function emails(para) {
  const arquivos = (await readdir(PASTA).catch(() => [])).sort()
  const lidos = await Promise.all(arquivos.map(async (a) => JSON.parse(await readFile(join(PASTA, a), 'utf8'))))
  return lidos.filter((e) => e.para === para)
}
/** Último e-mail para o destinatário (o pedido de senha é enviado depois da resposta: espera um pouco). */
async function ultimoEmail(para, assunto) {
  for (let i = 0; i < 30; i++) {
    const achados = (await emails(para)).filter((e) => !assunto || e.assunto.includes(assunto))
    if (achados.length) return achados.at(-1)
    await espera(200)
  }
  return null
}
const tokenDo = (email) => email?.texto.match(/redefinir-senha\?token=([\w-]+)/)?.[1]

await entrar('admin@onprint.local', 'admin123', 'Admin12345')
// Sessão aberta antes da troca (cookie de refresh), para conferir que ela é encerrada
const loginAntigo = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@onprint.local', senha: 'Admin12345' }) })
const cookieAntigo = loginAntigo.headers.get('set-cookie')?.split(';')[0] ?? ''

console.log('— Esqueci a senha —')
let r = await chamar('POST', '/auth/esqueci-senha', { body: { email: 'admin@onprint.local' } })
conferir('pedido aceito', r.status, 202)
const respostaPadrao = r.json.mensagem
const pedido = await ultimoEmail('admin@onprint.local', 'Redefinição')
conferir('e-mail de redefinição enviado', Boolean(pedido), true)
conferir('e-mail tem versão HTML com o botão', pedido?.html?.includes('Criar nova senha'), true)
const token = tokenDo(pedido)
conferir('link traz o token', (token?.length ?? 0) >= 40, true)

r = await chamar('POST', '/auth/esqueci-senha', { body: { email: 'ninguem@nao-existe.local' } })
conferir('e-mail inexistente: mesma resposta (não revela contas)', `${r.status} ${r.json.mensagem === respostaPadrao}`, '202 true')
await espera(800)
conferir('e-mail inexistente: nada é enviado', (await emails('ninguem@nao-existe.local')).length, 0)

r = await chamar('GET', `/auth/redefinir-senha/${token}`)
conferir('link aberto mostra quem e de qual empresa', `${r.status} ${r.json.email} ${r.json.finalidade}`, '200 admin@onprint.local redefinir')
conferir('senha curta é recusada', (await chamar('POST', '/auth/redefinir-senha', { body: { token, novaSenha: '123' } })).status, 400)
r = await chamar('POST', '/auth/redefinir-senha', { body: { token, novaSenha: 'NovaSenha2026' } })
conferir('senha nova salva pelo link', r.status, 204)
conferir('entra com a senha nova', (await chamar('POST', '/auth/login', { body: { email: 'admin@onprint.local', senha: 'NovaSenha2026' } })).status, 200)
conferir('a senha antiga deixa de valer', (await chamar('POST', '/auth/login', { body: { email: 'admin@onprint.local', senha: 'Admin12345' } })).status, 401)
conferir('sessão aberta antes da troca é encerrada', (await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { cookie: cookieAntigo } })).status, 401)
conferir('link não vale duas vezes', (await chamar('POST', '/auth/redefinir-senha', { body: { token, novaSenha: 'OutraSenha2026' } })).status, 404)
conferir('aviso de senha alterada', Boolean(await ultimoEmail('admin@onprint.local', 'foi alterada')), true)
conferir('token inventado', (await chamar('GET', '/auth/redefinir-senha/abcdefghijklmnopqrstuvwxyz0123456789')).status, 404)

console.log('\n— Limite de pedidos —')
const outro = 'limite@onprint.local'
const tentativas = []
for (let i = 0; i < 4; i++) tentativas.push((await chamar('POST', '/auth/esqueci-senha', { body: { email: outro } })).status)
conferir('o 4º pedido em 15 min para o mesmo e-mail é barrado', tentativas.join(','), '202,202,202,429')

console.log('\n— Convite de usuário novo —')
const adminNovo = await entrar('admin@onprint.local', 'NovaSenha2026')
const matriz = (await chamar('GET', '/permissoes', { token: adminNovo })).json
const vendedor = matriz.papeis.find((p) => p.codigo === 'vendedor').id
conferir('tela sabe que o e-mail está ativo', (await chamar('GET', '/usuarios/configuracao', { token: adminNovo })).json.emailConfigurado, true)
r = await chamar('POST', '/usuarios', { token: adminNovo, body: { nome: 'Vera Vendedora', email: 'vera@onprint.local', papelId: vendedor } })
conferir('usuário criado sem senha provisória, com convite', `${r.status} ${r.json.conviteEnviado}`, '201 true')
const vera = r.json
const convite = await ultimoEmail('vera@onprint.local', 'Seu acesso')
conferir('e-mail de convite enviado', Boolean(convite), true)
const tokenConvite = tokenDo(convite)
conferir('link do convite', (await chamar('GET', `/auth/redefinir-senha/${tokenConvite}`)).json.finalidade, 'convite')

conferir('admin reenvia link (o do convite deixa de valer)', (await chamar('POST', `/usuarios/${vera.id}/link-senha`, { token: adminNovo })).status, 204)
conferir('link antigo do convite inválido', (await chamar('GET', `/auth/redefinir-senha/${tokenConvite}`)).status, 404)
const tokenNovo = tokenDo(await ultimoEmail('vera@onprint.local', 'Redefinição'))
conferir('vera cria a senha pelo link novo', (await chamar('POST', '/auth/redefinir-senha', { body: { token: tokenNovo, novaSenha: 'Vendedora2026' } })).status, 204)
r = await chamar('POST', '/auth/login', { body: { email: 'vera@onprint.local', senha: 'Vendedora2026' } })
conferir('vera entra sem precisar trocar a senha de novo', `${r.status} ${r.json.usuario?.deveTrocarSenha}`, '200 false')

console.log('\n— Usuário desativado não recebe link —')
await chamar('DELETE', `/usuarios/${vera.id}`, { token: adminNovo })
const antes = (await emails('vera@onprint.local')).length
await chamar('POST', '/auth/esqueci-senha', { body: { email: 'vera@onprint.local' } })
await espera(800)
conferir('nenhum e-mail para usuário desativado', (await emails('vera@onprint.local')).length, antes)
conferir('admin não envia link para desativado', (await chamar('POST', `/usuarios/${vera.id}/link-senha`, { token: adminNovo })).status, 422)

console.log('\n— Outra empresa —')
const criacao = spawnSync('npx', ['tsx', 'prisma/criar-empresa.ts', '--nome', 'Gráfica Vizinha', '--email', 'dono@vizinha.local', '--senha', 'Inicial123'], { cwd: 'apps/api', encoding: 'utf8' })
conferir('empresa B criada', criacao.status, 0)
await chamar('POST', '/auth/esqueci-senha', { body: { email: 'dono@vizinha.local' } })
const tokenB = tokenDo(await ultimoEmail('dono@vizinha.local', 'Redefinição'))
r = await chamar('GET', `/auth/redefinir-senha/${tokenB}`)
conferir('link da empresa B mostra a empresa B', r.json.empresa, 'Gráfica Vizinha')
await chamar('POST', '/auth/redefinir-senha', { body: { token: tokenB, novaSenha: 'Vizinha2026' } })
r = await chamar('POST', '/auth/login', { body: { email: 'dono@vizinha.local', senha: 'Vizinha2026' } })
conferir('dono da empresa B entra com a senha nova, já sem troca obrigatória', `${r.status} ${r.json.usuario?.empresa.slug} ${r.json.usuario?.deveTrocarSenha}`, '200 grafica-vizinha false')

finalizar()
