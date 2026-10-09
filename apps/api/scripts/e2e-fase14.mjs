// Teste ponta a ponta dos benefícios da assinatura num banco DESCARTÁVEL recém-criado com seed, com o Asaas falso.
// Critério de aceite: cupom (cadastro, assinatura, janela de meses, limite, relatório), meses grátis (com e sem gateway),
// abono de cobrança, cortesia (sem prazo, com prazo, encerrada) e a empresa da plataforma como cortesia.
import { asaas, cli, dia, hoje, novaCobranca, servidor, webhook } from './e2e-asaas-falso.mjs'
import { chamar, conferir, entrar, finalizar } from './e2e-util.mjs'

/** Mesma regra do sistema: soma meses e prende no fim do mês (31/01 + 1 = 28/02). */
function maisMeses(iso, n) {
  const [a, m, d] = iso.split('-').map(Number)
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1))
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(d, ultimo))
  return alvo.toISOString().slice(0, 10)
}

const pt = (await chamar('POST', '/plataforma/auth/login', { body: { email: 'plataforma@onprint.local', senha: 'plataforma123' } })).json.accessToken
const painel = (metodo, caminho, body) => chamar(metodo, `/plataforma${caminho}`, { token: pt, body })
const empresa = async (slug) => (await painel('GET', `/empresas?busca=${slug}`)).json.find((e) => e.slug === slug)
const acao = async (slug, corpo) => painel('POST', `/empresas/${(await empresa(slug)).id}/acoes`, corpo)

console.log('— Empresa da plataforma —')
const principal = await empresa('principal')
conferir('empresa principal é cortesia (não paga mensalidade)', `${principal.situacao} ${principal.categoria} ${principal.valorCobrado} ${principal.beneficio?.rotulo}`, 'cortesia cortesia 0.00 Cortesia')
conferir('acesso normal', principal.nivel, 'normal')

console.log('\n— Cupons —')
let r = await painel('POST', '/cupons', { codigo: 'bemvindo20', tipo: 'percentual', valor: '20', duracaoMeses: 2, planos: [], ativo: true })
conferir('cupom criado (código em maiúsculas, resumo)', `${r.status} ${r.json.codigo} ${r.json.resumo}`, '201 BEMVINDO20 20% de desconto por 2 meses')
conferir('código repetido', (await painel('POST', '/cupons', { codigo: 'BEMVINDO20', tipo: 'valor', valor: '10', duracaoMeses: 1, planos: [] })).status, 409)
conferir('100% não é cupom (é cortesia)', (await painel('POST', '/cupons', { codigo: 'TUDO100', tipo: 'percentual', valor: '100', duracaoMeses: 1, planos: [] })).status, 400)
r = await painel('POST', '/cupons', { codigo: 'FIXO50', tipo: 'valor', valor: '50', duracaoMeses: '', limiteUsos: 1, planos: ['profissional', 'completo'] })
const fixo = r.json
conferir('cupom de valor fixo para sempre, 1 uso, só planos maiores', `${r.status} ${fixo.resumo} ${fixo.limiteUsos}`, '201 R$ 50,00 de desconto para sempre 1')
conferir('cadastro confere o cupom', (await chamar('GET', '/plataforma/cupons/validar?codigo=bemvindo20&plano=essencial')).json.descricao, '20% de desconto por 2 meses')
r = await chamar('GET', '/plataforma/cupons/validar?codigo=NADA99&plano=essencial')
conferir('cupom que não existe (mensagem genérica)', `${r.status} ${r.json.error?.message}`, '422 Cupom inválido ou indisponível.')
conferir('cupom de outro plano', (await chamar('GET', '/plataforma/cupons/validar?codigo=FIXO50&plano=essencial')).json.error?.message, 'Este cupom não vale para este plano.')

console.log('\n— Cupom no cadastro e ao assinar —')
const cadastro = { empresa: 'Gráfica Cupom', nome: 'Rita Souza', email: 'rita@cupom.local', senha: 'Cupom2026!', plano: 'essencial', aceite: true }
conferir('cadastro com cupom inválido é recusado', (await chamar('POST', '/plataforma/cadastro', { body: { ...cadastro, cupom: 'NADA99' } })).status, 422)
conferir('cadastro com cupom', (await chamar('POST', '/plataforma/cadastro', { body: { ...cadastro, cupom: 'bemvindo20' } })).status, 201)
const tc = await entrar(cadastro.email, cadastro.senha)
const minha = async (t = tc) => (await chamar('GET', '/assinatura', { token: t })).json
let a = await minha()
conferir('cupom guardado: começa na 1ª mensalidade', `${a.cupom?.codigo} ${a.cupom?.desconto} ${a.cupom?.desde}`, 'BEMVINDO20 29.80 null')
r = await chamar('GET', '/assinatura/cupom?codigo=bemvindo20&plano=profissional', { token: tc })
conferir('tela de assinar confere o cupom no plano escolhido', `${r.json.cheio} ${r.json.desconto} ${r.json.valor}`, '279.00 55.80 223.20')
r = await chamar('POST', '/assinatura/assinar', { token: tc, body: { plano: 'essencial', forma: 'pix_boleto', cpfCnpj: '11.222.333/0001-81' } })
conferir('assinou', r.status, 200)
const sub = [...asaas.assinaturas.values()].at(-1)
const m0 = dia(14)
const m1 = maisMeses(m0, 1)
const m2 = maisMeses(m0, 2)
conferir('Asaas: assinatura já no valor com desconto (149 − 20%)', `${sub.value} ${sub.nextDueDate}`, `119.2 ${m0}`)
a = await minha()
conferir('janela do cupom: 1ª e 2ª mensalidades', `${a.cupom?.desde} ${a.cupom?.ate}`, `${m0} ${m1}`)
conferir('1ª mensalidade com o desconto registrado', `${a.cobrancas[0]?.valor} ${a.cobrancas[0]?.desconto}`, '119.20 29.80')
const p0 = [...asaas.cobrancas.values()].find((p) => p.subscription === sub.id)
Object.assign(p0, { status: 'RECEIVED', paymentDate: hoje })
await webhook('PAYMENT_RECEIVED', { payment: p0 })
const p1 = novaCobranca(sub, m1)
await webhook('PAYMENT_CREATED', { payment: p1 })
conferir('2ª gerada com desconto; depois dela o Asaas volta ao valor cheio', `${p1.value} ${sub.value}`, '119.2 149')
const p2 = novaCobranca(sub, m2)
await webhook('PAYMENT_CREATED', { payment: p2 })
a = await minha()
const c2 = a.cobrancas.find((c) => c.vencimento === m2)
conferir('3ª mensalidade: valor cheio, sem desconto', `${c2?.valor} ${c2?.desconto}`, '149.00 null')
let cupons = (await painel('GET', '/cupons')).json
const bv = cupons.find((c) => c.codigo === 'BEMVINDO20')
conferir('relatório do cupom: usos, em uso, desconto concedido e receita', `${bv.usos} ${bv.emUso} ${bv.descontoConcedido} ${bv.receita}`, '1 1 29.80 119.20')
let lista = await empresa('grafica-cupom')
conferir('lista do painel: valor cobrado com cupom e benefício', `${lista.valorCobrado} ${lista.valorMensal} ${lista.beneficio?.tipo}`, '119.20 149.00 cupom')
conferir('filtro por benefício', (await painel('GET', '/empresas?beneficio=cupom')).json.map((e) => e.slug).join(','), 'grafica-cupom')

console.log('\n— Meses grátis (com Asaas) —')
r = await acao('grafica-cupom', { acao: 'meses_gratis', meses: 1, motivo: 'Indicou um cliente' })
conferir('1 mês grátis', r.status, 200)
a = await minha()
const c1 = a.cobrancas.find((c) => c.vencimento === m1)
conferir('a próxima mensalidade fica abonada, com o motivo', `${c1?.situacao} ${c1?.motivoAbono}`, 'abonada Mês grátis: Indicou um cliente')
conferir('Asaas: a cobrança foi removida', p1.deleted, true)
await webhook('PAYMENT_DELETED', { payment: { ...p1, deleted: true } })
conferir('aviso de remoção não desfaz o abono', (await minha()).cobrancas.find((c) => c.vencimento === m1)?.situacao, 'abonada')
conferir('próxima cobrança passa a ser a seguinte', (await minha()).proximoVencimento, m2)
conferir('evento no histórico com quem deu', (await painel('GET', `/empresas/${lista.id}`)).json.eventos.some((e) => e.tipo === 'meses_gratis' && e.autor === 'plataforma@onprint.local'), true)

console.log('\n— Cupom aplicado pelo suporte, limite de usos —')
cli('criar-empresa', ['--nome', 'Gráfica Manual', '--email', 'dono@manual.local', '--senha', 'Inicial123', '--ativa', '--plano', 'profissional'])
cli('criar-empresa', ['--nome', 'Gráfica Parceira', '--email', 'dono@parceira.local', '--senha', 'Inicial123', '--plano', 'profissional'])
r = await acao('grafica-manual', { acao: 'aplicar_cupom', codigo: 'fixo50' })
conferir('suporte aplica o cupom', `${r.status} ${r.json.assinatura?.cupom?.codigo}`, '200 FIXO50')
r = await acao('grafica-parceira', { acao: 'aplicar_cupom', codigo: 'FIXO50' })
conferir('limite de usos', `${r.status} ${r.json.error?.message}`, '422 Este cupom já atingiu o limite de usos.')
r = await acao('grafica-manual', { acao: 'cobranca_manual', vencimento: dia(10) })
let ficha = r.json
let cm = ficha.cobrancas.find((c) => c.vencimento === dia(10))
conferir('cobrança manual já sai com o desconto', `${cm?.valor} ${cm?.desconto}`, '229.00 50.00')

console.log('\n— Meses grátis (sem gateway) e abono —')
r = await acao('grafica-manual', { acao: 'meses_gratis', meses: 2, motivo: 'Instabilidade em março' })
ficha = r.json
conferir('2 meses abonados', ficha.cobrancas.filter((c) => c.situacao === 'abonada').map((c) => c.vencimento).sort().join(' '), `${dia(10)} ${maisMeses(dia(10), 1)}`)
conferir('próximo vencimento empurrado 2 meses', ficha.proximoVencimento, maisMeses(dia(10), 2))
const dm = await entrar('dono@manual.local', 'Inicial123', 'Manual12345')
await acao('grafica-manual', { acao: 'cobranca_manual', vencimento: dia(-20), valor: '279.00' })
conferir('cobrança vencida há 20 dias: bloqueada', (await chamar('GET', '/auth/me', { token: dm })).json.assinatura.nivel, 'bloqueado')
ficha = (await painel('GET', `/empresas/${(await empresa('grafica-manual')).id}`)).json
const vencida = ficha.cobrancas.find((c) => c.vencimento === dia(-20))
conferir('abonar exige motivo', (await acao('grafica-manual', { acao: 'abonar', cobrancaId: vencida.id, motivo: '' })).status, 400)
r = await acao('grafica-manual', { acao: 'abonar', cobrancaId: vencida.id, motivo: 'Cobrança lançada por engano' })
conferir('abonada: libera na hora', `${r.status} ${(await chamar('GET', '/auth/me', { token: dm })).json.assinatura.nivel}`, '200 normal')
conferir('abonada aparece para a empresa com o motivo', (await minha(dm)).cobrancas.find((c) => c.id === vencida.id)?.motivoAbono, 'Cobrança lançada por engano')
conferir('não abona duas vezes', (await acao('grafica-manual', { acao: 'abonar', cobrancaId: vencida.id, motivo: 'De novo' })).status, 422)

console.log('\n— Cortesia —')
const dp = await entrar('dono@parceira.local', 'Inicial123', 'Parceira123')
r = await acao('grafica-parceira', { acao: 'cortesia', ate: null, motivo: 'Parceiro de divulgação' })
let s = (await chamar('GET', '/auth/me', { token: dp })).json.assinatura
conferir('cortesia sem prazo: acesso normal', `${r.status} ${s.nivel} ${s.motivo}`, '200 normal cortesia')
a = await minha(dp)
conferir('tela: cortesia com o motivo, sem prazo', `${a.situacao} ${a.cortesia?.ate} ${a.cortesia?.motivo}`, 'cortesia null Parceiro de divulgação')
conferir('cortesia sem prazo não assina', (await chamar('POST', '/assinatura/assinar', { token: dp, body: { plano: 'essencial', forma: 'pix_boleto', cpfCnpj: '11.222.333/0001-81' } })).status, 422)
lista = await empresa('grafica-parceira')
conferir('painel: categoria cortesia, valor 0', `${lista.categoria} ${lista.valorCobrado} ${lista.beneficio?.tipo}`, 'cortesia 0.00 cortesia')
r = await acao('grafica-parceira', { acao: 'encerrar_cortesia' })
s = (await chamar('GET', '/auth/me', { token: dp })).json.assinatura
conferir('cortesia encerrada: precisa assinar (conta como fim de teste)', `${s.nivel} ${s.motivo} ${s.diasAtraso}`, 'aviso cortesia_encerrada 1')
conferir('cortesia encerrada some dos benefícios', (await empresa('grafica-parceira')).beneficio, null)

r = await acao('grafica-cupom', { acao: 'cortesia', ate: dia(45), motivo: 'Compensação por indisponibilidade' })
s = (await chamar('GET', '/auth/me', { token: tc })).json.assinatura
conferir('cortesia com prazo: dias restantes', `${r.status} ${s.motivo} ${s.diasRestantesTeste}`, '200 cortesia 45')
conferir('Asaas: próxima cobrança no fim da cortesia; a já gerada depois dela é removida', `${sub.nextDueDate} ${p2.deleted}`, `${dia(45)} true`)
a = await minha()
conferir('cupom encerrado com a cortesia', a.cupom, null)
conferir('aviso nos últimos dias (não ainda)', s.nivel, 'normal')

conferir('chamadas ao Asaas sempre com a chave', asaas.chamadas.length > 5, true)
servidor.close()
finalizar()
