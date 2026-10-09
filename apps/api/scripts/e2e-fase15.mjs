// Teste ponta a ponta da aparência (marca da empresa) num banco DESCARTÁVEL recém-criado com seed.
// Critério de aceite: o login traz nome de exibição, logo e cor; só quem edita configurações troca a cor;
// cor fora da paleta é recusada; nome fantasia vira o nome do topo; modo claro/escuro é de cada usuário.
import { chamar, conferir, entrar, finalizar } from './e2e-util.mjs'

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

finalizar()
