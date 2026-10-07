// Teste ponta a ponta da Fase 11 (planos, módulos e bloqueio escalonado) num banco DESCARTÁVEL recém-criado com seed.
// A API temporária roda com CACHE_EMPRESAS_SEGUNDOS=0: cada mudança na assinatura vale na próxima requisição.
// Critério de aceite: em dia → aviso → só leitura → bloqueado, com liberação/bloqueio manual, limite de
// usuários e módulos do plano — sem afetar outra empresa.
import { spawnSync } from 'node:child_process'
import { chamar, conferir, entrar, finalizar } from './e2e-util.mjs'

const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
const dia = (n) => new Date(Date.parse(`${hoje}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10)
const cli = (script, args) => spawnSync('npx', ['tsx', `prisma/${script}.ts`, ...args], { cwd: 'apps/api', encoding: 'utf8' })
function assinatura(...args) {
  const r = cli('assinatura', ['--empresa', 'grafica-teste-b', ...args])
  if (r.status !== 0) console.log(r.stdout, r.stderr)
  return r.status
}

const a = await entrar('admin@onprint.local', 'admin123', 'Admin12345')
let me = (await chamar('GET', '/auth/me', { token: a })).json
console.log('— Empresa padrão —')
conferir('plano completo, em dia', `${me.assinatura?.plano} ${me.assinatura?.nivel} ${me.assinatura?.motivo}`, 'Completo normal em_dia')

console.log('\n— Empresa B em teste grátis no plano Essencial —')
conferir('empresa criada com plano', cli('criar-empresa', ['--nome', 'Gráfica Teste B', '--email', 'dono@b.local', '--senha', 'Inicial123', '--plano', 'essencial', '--exemplos']).status, 0)
const b = await entrar('dono@b.local', 'Inicial123', 'DonoB12345')
me = (await chamar('GET', '/auth/me', { token: b })).json
conferir('teste grátis de 14 dias', `${me.assinatura.motivo} ${me.assinatura.diasRestantesTeste}`, 'teste 14')
conferir('permissões sem módulos fora do plano', `${me.permissoes.includes('pedidos:criar')} ${me.permissoes.some((p) => p.startsWith('estoque:'))}`, 'true false')
let r = await chamar('GET', '/estoque/locais', { token: b })
conferir('módulo fora do plano recusado pela API', `${r.status} ${r.json.error?.code}`, '403 MODULO_NAO_CONTRATADO')
const minha = (await chamar('GET', '/assinatura', { token: b })).json
conferir('"Minha assinatura": plano, módulos e planos', `${minha.plano.nome} ${minha.modulos.find((m) => m.codigo === 'estoque').incluido} ${minha.planos.length}`, 'Essencial false 3')
conferir('estoque aparece como disponível em outros planos', minha.modulos.find((m) => m.codigo === 'estoque').planos.join(','), 'Profissional,Completo')

console.log('\n— Limite de usuários (Essencial: 3) —')
const papeis = (await chamar('GET', '/permissoes', { token: b })).json.papeis
const vendedor = papeis.find((p) => p.codigo === 'vendedor').id
const novo = (n) => chamar('POST', '/usuarios', { token: b, body: { nome: `Vendedor ${n}`, email: `vend${n}@b.local`, papelId: vendedor, senhaProvisoria: 'provisoria1' } })
const u2 = await novo(2)
const u3 = await novo(3)
conferir('2º e 3º usuários dentro do limite', `${u2.status} ${u3.status}`, '201 201')
r = await novo(4)
conferir('4º usuário ativo passa do limite', `${r.status} ${r.json.error?.message.includes('até 3 usuários')}`, '422 true')
await chamar('DELETE', `/usuarios/${u3.json.id}`, { token: b })
conferir('com uma vaga livre, cria de novo', (await novo(5)).status, 201)
r = await chamar('PUT', `/usuarios/${u3.json.id}`, { token: b, body: { nome: 'Vendedor 3', email: 'vend3@b.local', papelId: vendedor, ativo: true } })
conferir('reativar sem vaga também é barrado', r.status, 422)

// Um orçamento para testar o link público durante o bloqueio
const cat = (await chamar('GET', '/orcamentos/catalogo', { token: b })).json
const cliente = (await chamar('POST', '/clientes', { token: b, body: { nome: 'Cliente da B', whatsapp: '11944443333' } })).json
const orc = (await chamar('POST', '/orcamentos', { token: b, body: { clienteId: cliente.id, itens: [{ produtoId: cat.find((p) => p.nome.startsWith('Caneca')).id, quantidade: 5 }] } })).json
const tokenPublico = (await chamar('GET', `/orcamentos/${orc.id}`, { token: b })).json.tokenPublico

const nivelB = async () => (await chamar('GET', '/auth/me', { token: b })).json.assinatura
const criarCliente = (nome) => chamar('POST', '/clientes', { token: b, body: { nome, email: `${nome.replace(/\W/g, '').toLowerCase()}@x.local` } })

console.log('\n— Atraso escalonado (5 dias só leitura, 15 bloqueio) —')
conferir('pagamento confirmado: ativa e em dia', assinatura('--ativar'), 0)
conferir('em dia', (await nivelB()).motivo, 'em_dia')
assinatura('--atraso-desde', dia(-3))
let s = await nivelB()
conferir('3 dias de atraso: aviso com contagem', `${s.nivel} ${s.diasAtraso} ${s.diasParaSomenteLeitura}`, 'aviso 3 2')
conferir('no aviso, tudo funciona', (await criarCliente('Cliente Aviso')).status, 201)

assinatura('--atraso-desde', dia(-6))
s = await nivelB()
conferir('6 dias: só leitura', `${s.nivel} ${s.diasParaBloqueio}`, 'somente_leitura 9')
conferir('só leitura: consulta funciona', (await chamar('GET', '/clientes', { token: b })).status, 200)
r = await criarCliente('Cliente Leitura')
conferir('só leitura: gravação recusada com motivo', `${r.status} ${r.json.error?.code}`, '403 ASSINATURA_SOMENTE_LEITURA')
me = (await chamar('GET', '/auth/me', { token: b })).json
conferir('só leitura: botões de criar somem (permissões)', `${me.permissoes.includes('clientes:visualizar')} ${me.permissoes.includes('clientes:criar')}`, 'true false')
conferir('só leitura: link público ainda abre', (await chamar('GET', `/publico/grafica-teste-b/orcamentos/${tokenPublico}`)).status, 200)

assinatura('--atraso-desde', dia(-20))
s = await nivelB()
conferir('20 dias: bloqueado', `${s.nivel} ${s.motivo}`, 'bloqueado atraso')
r = await chamar('GET', '/clientes', { token: b })
conferir('bloqueado: nem consulta', `${r.status} ${r.json.error?.code}`, '403 ASSINATURA_BLOQUEADA')
conferir('bloqueado: "Minha assinatura" continua abrindo', (await chamar('GET', '/assinatura', { token: b })).status, 200)
conferir('bloqueado: login funciona (para regularizar)', (await chamar('POST', '/auth/login', { body: { email: 'dono@b.local', senha: 'DonoB12345' } })).status, 200)
conferir('bloqueado: nenhuma permissão na tela', (await chamar('GET', '/auth/me', { token: b })).json.permissoes.length, 0)
conferir('bloqueado: link público para de abrir', (await chamar('GET', `/publico/grafica-teste-b/orcamentos/${tokenPublico}`)).status, 404)
conferir('a outra empresa segue normal', (await chamar('GET', '/clientes', { token: a })).status, 200)

console.log('\n— Ações manuais do suporte —')
assinatura('--liberar-ate', dia(2))
s = await nivelB()
conferir('liberação manual por 2 dias', `${s.nivel} ${s.motivo}`, 'normal liberacao_manual')
conferir('liberado: grava de novo', (await criarCliente('Cliente Liberado')).status, 201)
assinatura('--liberar-ate', 'nenhum', '--atraso-desde', 'nenhum', '--bloquear', 'Uso indevido (teste)')
s = await nivelB()
conferir('bloqueio manual mesmo em dia', `${s.nivel} ${s.motivo}`, 'bloqueado bloqueio_manual')
assinatura('--desbloquear')
conferir('desbloqueado', (await nivelB()).nivel, 'normal')

console.log('\n— Troca de plano —')
assinatura('--plano', 'completo')
me = (await chamar('GET', '/auth/me', { token: b })).json
conferir('plano Completo libera o estoque na hora', `${me.assinatura.plano} ${(await chamar('GET', '/estoque/locais', { token: b })).status}`, 'Completo 200')
conferir('limite de usuários sobe junto', (await novo(6)).status, 201)

console.log('\n— Cancelamento —')
assinatura('--cancelar')
s = await nivelB()
conferir('cancelada: bloqueada', `${s.nivel} ${s.motivo}`, 'bloqueado cancelada')
assinatura('--reativar')
conferir('reativada', (await nivelB()).nivel, 'normal')

const lista = cli('assinatura', ['--listar'])
conferir('listagem para o suporte', lista.stdout.includes('grafica-teste-b') && lista.stdout.includes('principal'), true)
conferir('opção inválida é recusada', assinatura('--atraso-desde', '20/10/2026'), 1)

finalizar()
