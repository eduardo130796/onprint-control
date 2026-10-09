// Teste ponta a ponta da aparência (marca da empresa) num banco DESCARTÁVEL recém-criado com seed.
// Critério de aceite: o login traz nome de exibição, logo e cor; só quem edita configurações troca a cor;
// cor fora da paleta é recusada; nome fantasia vira o nome do topo; modo claro/escuro é de cada usuário.
import { PrismaClient } from '@prisma/client'
import { BASE, chamar, conferir, entrar, finalizar } from './e2e-util.mjs'

const admin = await entrar('admin@onprint.local', 'admin123', 'Admin12345')
let me = (await chamar('GET', '/auth/me', { token: admin })).json
conferir('login traz a marca: nome de exibição, sem logo, cor padrão', `${Boolean(me.empresa.exibicao)} ${me.empresa.logoArquivoId} ${me.empresa.corTema}`, 'true null null')

conferir('cor fora da paleta é recusada', (await chamar('PUT', '/empresa/tema', { token: admin, body: { corTema: 'neon' } })).status, 400)
let r = await chamar('PUT', '/empresa/tema', { token: admin, body: { corTema: 'roxo' } })
conferir('administrador troca a cor', `${r.status} ${r.json.corTema}`, '200 roxo')
me = (await chamar('GET', '/auth/me', { token: admin })).json
conferir('login seguinte já vem com a cor', me.empresa.corTema, 'roxo')

const empresa = (await chamar('GET', '/empresa', { token: admin })).json
r = await chamar('PUT', '/empresa', {
  token: admin,
  body: { razaoSocial: empresa.razaoSocial, nomeFantasia: 'Gráfica Aurora', validadeOrcamentoDias: empresa.validadeOrcamentoDias, sinalPercentual: empresa.sinalPercentual, areaMinimaM2: empresa.areaMinimaM2 },
})
conferir('dados da empresa salvos', r.status, 200)
me = (await chamar('GET', '/auth/me', { token: admin })).json
conferir('nome fantasia vira o nome do topo', me.empresa.exibicao, 'Gráfica Aurora')

const papeis = (await chamar('GET', '/permissoes', { token: admin })).json.papeis
await chamar('POST', '/usuarios', { token: admin, body: { nome: 'Vendedora', email: 'vend@aurora.local', papelId: papeis.find((p) => p.codigo === 'vendedor').id, senhaProvisoria: 'provisoria1' } })
const vend = await entrar('vend@aurora.local', 'provisoria1', 'Vendedora123')
conferir('vendedora vê a cor da empresa', (await chamar('GET', '/auth/me', { token: vend })).json.empresa.corTema, 'roxo')
conferir('vendedora não troca a cor', (await chamar('PUT', '/empresa/tema', { token: vend, body: { corTema: 'azul' } })).status, 403)

console.log('\n— Modo da tela (de cada usuário) —')
conferir('padrão: claro', (await chamar('GET', '/auth/me', { token: vend })).json.modoTela, 'claro')
conferir('modo inválido recusado', (await chamar('PUT', '/auth/preferencias', { token: vend, body: { modoTela: 'neon' } })).status, 400)
conferir('vendedora escolhe o escuro (sem permissão de configurações)', (await chamar('PUT', '/auth/preferencias', { token: vend, body: { modoTela: 'escuro' } })).status, 200)
conferir('fica salvo na conta dela', (await chamar('GET', '/auth/me', { token: vend })).json.modoTela, 'escuro')
conferir('não muda o dos colegas', (await chamar('GET', '/auth/me', { token: admin })).json.modoTela, 'claro')

console.log('\n— Texto: fonte e peso (de cada usuário) —')
let texto = (await chamar('GET', '/auth/me', { token: vend })).json
conferir('padrão: Inter', texto.fonte, 'inter')
conferir('padrão: peso normal', texto.pesoTexto, 'normal')
conferir('fonte inválida recusada', (await chamar('PUT', '/auth/preferencias', { token: vend, body: { fonte: 'comic' } })).status, 400)
conferir('sem nenhuma preferência é recusado', (await chamar('PUT', '/auth/preferencias', { token: vend, body: {} })).status, 400)
conferir('escolhe Lexend e texto leve', (await chamar('PUT', '/auth/preferencias', { token: vend, body: { fonte: 'lexend', pesoTexto: 'leve' } })).status, 200)
texto = (await chamar('GET', '/auth/me', { token: vend })).json
conferir('fonte salva', texto.fonte, 'lexend')
conferir('peso salvo', texto.pesoTexto, 'leve')
conferir('o modo da tela continua o mesmo', texto.modoTela, 'escuro')
conferir('não muda a fonte dos colegas', (await chamar('GET', '/auth/me', { token: admin })).json.fonte, 'inter')

console.log('\n— Saída por inatividade —')
let empresaAtual = (await chamar('GET', '/empresa', { token: admin })).json
const corpoEmpresa = (extra) => ({ razaoSocial: empresaAtual.razaoSocial, nomeFantasia: empresaAtual.nomeFantasia, validadeOrcamentoDias: empresaAtual.validadeOrcamentoDias, sinalPercentual: empresaAtual.sinalPercentual, areaMinimaM2: empresaAtual.areaMinimaM2, ...extra })
conferir('padrão: 30 minutos', (await chamar('GET', '/auth/me', { token: admin })).json.empresa.inatividadeMinutos, 30)
conferir('tempo fora da lista é recusado', (await chamar('PUT', '/empresa', { token: admin, body: corpoEmpresa({ inatividadeMinutos: 7 }) })).status, 400)
conferir('administrador escolhe 60 minutos', (await chamar('PUT', '/empresa', { token: admin, body: corpoEmpresa({ inatividadeMinutos: 60 }) })).json.inatividadeMinutos, 60)
conferir('login traz o tempo', (await chamar('GET', '/auth/me', { token: admin })).json.empresa.inatividadeMinutos, 60)

// Sessão parada além do limite (aba fechada e reaberta horas depois) não volta sozinha
const banco = new PrismaClient()
async function loginComCookie(email, senha) {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }) })
  return (r.headers.get('set-cookie') ?? '').split(';')[0]
}
async function envelhecerSessoes(email, horas) {
  await banco.$executeRawUnsafe(`UPDATE sessoes SET created_at = now() - interval '${Number(horas)} hours' WHERE usuario_id = (SELECT id FROM usuarios WHERE email = $1) AND revogada = false`, email)
}
const renovar = (cookie) => fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { Cookie: cookie } })
let cookie = await loginComCookie('vend@aurora.local', 'Vendedora123')
let r2 = await renovar(cookie)
conferir('sessão em uso renova normalmente', r2.status, 200)
cookie = (r2.headers.get('set-cookie') ?? '').split(';')[0]
await envelhecerSessoes('vend@aurora.local', 2)
r2 = await renovar(cookie)
conferir('parada há 2 h (limite 60 min): não renova', `${r2.status} ${(await r2.json()).error?.message}`, '401 Sessão encerrada por inatividade. Entre de novo.')

const vendedora = (await chamar('GET', '/usuarios?busca=vend@aurora.local', { token: admin })).json.data[0]
r2 = await chamar('PUT', `/usuarios/${vendedora.id}`, {
  token: admin,
  body: { nome: vendedora.nome, email: vendedora.email, telefone: vendedora.telefone ?? '', papelId: vendedora.papel.id, comissaoPercentual: vendedora.comissaoPercentual, ativo: true, semInatividade: true },
})
conferir('administrador marca usuário de painel (TV)', `${r2.status} ${r2.json.semInatividade}`, '200 true')
cookie = await loginComCookie('vend@aurora.local', 'Vendedora123')
await envelhecerSessoes('vend@aurora.local', 2)
conferir('usuário de painel continua conectado', (await renovar(cookie)).status, 200)
await banco.$disconnect()

finalizar()
