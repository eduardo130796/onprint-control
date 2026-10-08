// Teste ponta a ponta da Fase 13 (painel da plataforma e cadastro público) num banco DESCARTÁVEL recém-criado com seed.
// O seed cria o admin da plataforma de desenvolvimento (plataforma@onprint.local / plataforma123).
// Critério de aceite: o dono do sistema vê quantas empresas estão em cada situação e o que está com problema,
// age na assinatura de qualquer empresa e uma gráfica nova se cadastra sozinha em teste grátis.
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chamar, conferir, entrar, finalizar } from './e2e-util.mjs'

const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
const dia = (n) => new Date(Date.parse(`${hoje}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10)
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

console.log('— Login da plataforma —')
conferir('senha errada', (await chamar('POST', '/plataforma/auth/login', { body: { email: 'plataforma@onprint.local', senha: 'errada123' } })).status, 401)
const login = await chamar('POST', '/plataforma/auth/login', { body: { email: 'plataforma@onprint.local', senha: 'plataforma123' } })
conferir('admin da plataforma entra', login.status, 200)
const p = login.json.accessToken
const gestor = await entrar('admin@onprint.local', 'admin123', 'Admin12345')
conferir('token de empresa não abre o painel', (await chamar('GET', '/plataforma/painel', { token: gestor })).status, 401)
conferir('token do painel não abre o sistema de uma empresa', (await chamar('GET', '/clientes', { token: p })).status, 401)
conferir('painel sem login', (await chamar('GET', '/plataforma/painel')).status, 401)

console.log('\n— Cadastro público ("Criar conta") —')
const publicos = (await chamar('GET', '/plataforma/planos-publicos')).json
conferir('planos à venda para a página de cadastro', `${publicos.cadastroAberto} ${publicos.planos.length}`, 'true 3')
const cadastro = { empresa: 'Gráfica Nova Era', nome: 'Joana Lima', email: 'joana@novaera.local', telefone: '(11) 98765-4321', senha: 'NovaEra2026', plano: 'essencial', aceite: true }
conferir('sem aceite dos termos é recusado', (await chamar('POST', '/plataforma/cadastro', { body: { ...cadastro, aceite: false } })).status, 400)
conferir('robô (campo armadilha preenchido) é recusado', (await chamar('POST', '/plataforma/cadastro', { body: { ...cadastro, site: 'http://spam' } })).status, 400)
let r = await chamar('POST', '/plataforma/cadastro', { body: cadastro })
conferir('gráfica se cadastra sozinha em teste grátis', `${r.status} ${r.json.slug} ${r.json.testeAte}`, `201 grafica-nova-era ${dia(14)}`)
r = await chamar('POST', '/auth/login', { body: { email: 'joana@novaera.local', senha: 'NovaEra2026' } })
conferir('entra direto com a senha que escolheu (sem troca obrigatória)', `${r.status} ${r.json.usuario?.deveTrocarSenha} ${r.json.usuario?.assinatura?.motivo}`, '200 false teste')
const joana = r.json.accessToken
conferir('telefone do cadastro foi para os dados da empresa', (await chamar('GET', '/empresa', { token: joana })).json.whatsapp, '11987654321')
conferir('e-mail já usado não cria outra empresa', (await chamar('POST', '/plataforma/cadastro', { body: { ...cadastro, empresa: 'Outra' } })).status, 409)
await espera(300)
const emails = await Promise.all((await readdir(process.env.EMAIL_PASTA ?? '/tmp/e2e-emails').catch(() => [])).map(async (a) => JSON.parse(await readFile(join(process.env.EMAIL_PASTA ?? '/tmp/e2e-emails', a), 'utf8'))))
conferir('e-mail de boas-vindas enviado', emails.some((e) => e.para === 'joana@novaera.local' && e.assunto.includes('Bem-vindo')), true)

console.log('\n— Empresa criada pelo suporte (convite por e-mail) —')
r = await chamar('POST', '/plataforma/empresas', { token: p, body: { nome: 'Gráfica do Suporte', email: 'dono@suporte.local', responsavel: 'Carlos Dono', plano: 'profissional', situacao: 'ativa' } })
conferir('criada sem senha: convite enviado', `${r.status} ${r.json.conviteEnviado}`, '201 true')
const suporteId = r.json.id

console.log('\n— Ações do suporte —')
const empresas = (await chamar('GET', '/plataforma/empresas', { token: p })).json
const novaEra = empresas.find((e) => e.slug === 'grafica-nova-era')
conferir('lista com plano e situação', `${empresas.length} ${novaEra?.plano} ${novaEra?.categoria}`, '3 Essencial teste')
const acao = (id, body) => chamar('POST', `/plataforma/empresas/${id}/acoes`, { token: p, body })
r = await acao(novaEra.id, { acao: 'teste_ate', data: dia(30) })
conferir('estende o teste para 30 dias', `${r.status} ${r.json.testeAte}`, `200 ${dia(30)}`)
r = await acao(suporteId, { acao: 'cobranca_manual', vencimento: dia(-8) })
conferir('cobrança manual vencida há 8 dias → só leitura', `${r.status} ${r.json.nivel}`, '200 somente_leitura')
r = await acao(suporteId, { acao: 'liberar_ate', data: dia(3) })
conferir('liberação temporária pelo suporte', r.json.assinatura.acesso.motivo, 'liberacao_manual')
r = await acao(suporteId, { acao: 'liberar_ate', data: null })
r = await acao(suporteId, { acao: 'registrar_pagamento' })
conferir('pagamento registrado: em dia', `${r.json.categoria} ${r.json.cobrancas[0]?.situacao}`, 'em_dia paga')
r = await acao(novaEra.id, { acao: 'bloquear', motivo: 'Teste de bloqueio' })
conferir('bloqueio manual', r.json.categoria, 'bloqueada')
conferir('bloqueio vale na hora para a gráfica', (await chamar('GET', '/clientes', { token: joana })).json.error?.code, 'ASSINATURA_BLOQUEADA')
conferir('ação inválida é recusada', (await acao(novaEra.id, { acao: 'teste_ate', data: '30/10/2026' })).status, 400)
conferir('registrar pagamento sem cobrança aberta: mensagem clara', (await acao(novaEra.id, { acao: 'registrar_pagamento' })).json.error?.message, 'Nenhuma cobrança em aberto.')

console.log('\n— Painel: números e problemas —')
await chamar('POST', '/plataforma/webhooks/asaas', { body: { id: 'evt_orfao', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_x', subscription: 'sub_inexistente', value: 10, dueDate: hoje, status: 'RECEIVED' } }, headers: { 'asaas-access-token': 'token-de-webhook-de-teste-com-32-caracteres-ok' } })
const painel = (await chamar('GET', '/plataforma/painel', { token: p })).json
conferir('contagem por situação', JSON.stringify(painel.indicadores.porCategoria), JSON.stringify({ em_dia: 1, teste: 0, cortesia: 1, aviso: 0, somente_leitura: 0, bloqueada: 1, cancelada: 0 }))
// A empresa da plataforma (Completo) é cortesia: fora da receita
conferir('receita mensal das ativas em dia (Profissional 279; a da plataforma é cortesia)', painel.indicadores.receitaMensal, '279.00')
conferir('recebido no mês (pagamento manual de 279)', painel.recebidoNoMes, '279.00')
conferir('novas empresas e conversões', `${painel.novasEmpresas30Dias} ${painel.conversoes30Dias}`, '3 0')
conferir('problema: empresa bloqueada (gravidade alta, primeiro da lista)', `${painel.problemas[0]?.tipo} ${painel.problemas[0]?.gravidade} ${painel.problemas[0]?.empresa?.slug}`, 'bloqueada alta grafica-nova-era')
const aviso = painel.problemas.find((x) => x.tipo === 'aviso_gateway')
conferir('problema: aviso do Asaas não aplicado, com reprocessar', Boolean(aviso?.eventoId), true)
conferir('reprocessar ainda falha (assinatura não existe) com motivo', (await chamar('POST', `/plataforma/eventos-gateway/${aviso.eventoId}/reprocessar`, { token: p })).status, 422)
conferir('lista de avisos com erro', (await chamar('GET', '/plataforma/eventos-gateway?erro=true', { token: p })).json.length, 1)

console.log('\n— Ficha da empresa —')
const ficha = (await chamar('GET', `/plataforma/empresas/${suporteId}`, { token: p })).json
conferir('ficha: admin, cobranças e histórico com o autor', `${ficha.usuarios.admins[0]?.email} ${ficha.cobrancas.length} ${ficha.eventos.some((e) => e.autor === 'plataforma@onprint.local')}`, 'dono@suporte.local 1 true')
conferir('filtros: só bloqueadas', (await chamar('GET', '/plataforma/empresas?nivel=bloqueado', { token: p })).json.map((e) => e.slug).join(','), 'grafica-nova-era')

console.log('\n— Planos —')
const planos = (await chamar('GET', '/plataforma/planos', { token: p })).json
conferir('planos com quantas empresas usam cada um', planos.map((x) => `${x.codigo}:${x.assinaturas}`).join(' '), 'essencial:1 profissional:1 completo:1')
const essencial = planos.find((x) => x.codigo === 'essencial')
r = await chamar('PUT', `/plataforma/planos/${essencial.id}`, { token: p, body: { ...essencial, valorMensal: '159,90', modulos: [...essencial.modulos, 'estoque'] } })
conferir('preço e módulos do plano alterados', `${r.status} ${r.json.valorMensal}`, '200 159.9')
await acao(novaEra.id, { acao: 'desbloquear' })
conferir('módulo novo do plano liberado para quem já está nele', (await chamar('GET', '/estoque/locais', { token: joana })).status, 200)
conferir('bloqueio depois do só leitura (regra do plano)', (await chamar('POST', '/plataforma/planos', { token: p, body: { ...essencial, codigo: 'ruim', diasAteSomenteLeitura: 10, diasAteBloqueio: 5 } })).status, 400)
conferir('código de plano repetido', (await chamar('POST', '/plataforma/planos', { token: p, body: { ...essencial, codigo: 'essencial' } })).status, 409)

finalizar()
