import { describe, expect, it } from 'vitest'
import { classificarSimulado } from '../src/integrations/ia/simulado'
import { pedidoClassificarResposta } from '../src/modules/assistente/prompts'
import {
  JANELA_CONVERSA_MS,
  assuntoDaLeitura,
  assuntoMaisImportante,
  assuntoPelasRegras,
  juntarNaConversa,
  numeroCanonico,
  numeroParaCadastro,
  numerosParaBusca,
  quandoFalar,
  respostaProntaDoPedido,
  soCortesia,
} from '../src/modules/whatsapp/conversas'

const agora = new Date('2026-10-25T22:00:00Z')
const semPedido = { temPedidoEmAndamento: false }
const comPedido = { temPedidoEmAndamento: true }

describe('Conversas do WhatsApp: agrupamento', () => {
  it('mensagens seguidas do mesmo contato (conversa aberta, há poucos minutos) viram uma conversa só', () => {
    expect(juntarNaConversa(null, agora)).toBe(false)
    expect(juntarNaConversa({ situacao: 'aberta', ultimaEm: new Date(agora.getTime() - 60_000) }, agora)).toBe(true)
    expect(juntarNaConversa({ situacao: 'aberta', ultimaEm: new Date(agora.getTime() - JANELA_CONVERSA_MS + 1000) }, agora)).toBe(true)
    // Muito tempo depois: conversa nova (outro pedido)
    expect(juntarNaConversa({ situacao: 'aberta', ultimaEm: new Date(agora.getTime() - JANELA_CONVERSA_MS - 1) }, agora)).toBe(false)
    // A equipe já resolveu: o que chegar depois é outra conversa
    expect(juntarNaConversa({ situacao: 'resolvida', ultimaEm: new Date(agora.getTime() - 60_000) }, agora)).toBe(false)
  })
  it('só cortesia (obrigado, ok, bom dia, emoji) não pede ação', () => {
    for (const t of [['obrigado'], ['Obrigada!'], ['ok 👍'], ['👍'], ['bom dia'], ['Valeu, obrigado'], ['ok', 'obrigado'], ['🙏🙏']]) expect(soCortesia(t)).toBe(true)
    for (const t of [['bom dia, quanto é o banner?'], ['ok, e o prazo?'], ['tá pronto?'], [], ['obrigado', 'mas e o desconto?']]) expect(soCortesia(t)).toBe(false)
  })
  it('número com e sem o 9º dígito e com e sem o 55 (como o cadastro guarda)', () => {
    expect(numerosParaBusca('5511988887777').sort()).toEqual(['1188887777', '11988887777', '551188887777', '5511988887777'])
    expect(numerosParaBusca(null)).toEqual([])
    expect(numeroParaCadastro('5511988887777')).toBe('11988887777')
    expect(numeroParaCadastro('987654321098765')).toBeNull()
    expect(numeroParaCadastro(null)).toBeNull()
    // Conta antiga sem o 9º dígito: guardada com o 9 (o envio e o cadastro aceitam)
    expect(numeroCanonico('551177889900')).toBe('5511977889900')
    expect(numeroCanonico('5511977889900')).toBe('5511977889900')
    expect(numeroCanonico('551133334444')).toBe('551133334444')
    expect(numeroCanonico(null)).toBeNull()
  })
})

describe('Conversas do WhatsApp: assunto pelas palavras (sem o Assistente)', () => {
  it.each([
    'Oi, boa noite, quanto é o adesivo 2x1 fosco ou perfurado para colocar no carro e mil panfletos',
    'faz 500 cartões de visita?',
    'Queria orçar uma fachada',
    'preciso de um banner 2x1',
    'qual o valor do milheiro de panfleto?',
    'quanto fica para entregar 500 panfletos amanhã',
  ])('"%s" é pedido de orçamento', (t) => expect(assuntoPelasRegras([t], semPedido)).toBe('orcamento'))
  it('pergunta de pedido: com "pedido" no texto, ou de quem tem pedido em andamento', () => {
    expect(assuntoPelasRegras(['meu pedido já ficou pronto?'], semPedido)).toBe('pedido')
    expect(assuntoPelasRegras(['tá pronto?'], comPedido)).toBe('pedido')
    expect(assuntoPelasRegras(['posso buscar hoje?'], comPedido)).toBe('pedido')
    // Sem pedido em andamento, "tá pronto?" é só dúvida
    expect(assuntoPelasRegras(['tá pronto?'], semPedido)).toBe('duvida')
  })
  it('dúvida e conversa', () => {
    expect(assuntoPelasRegras(['vocês abrem sábado?'], semPedido)).toBe('duvida')
    expect(assuntoPelasRegras(['qual o endereço de vocês'], semPedido)).toBe('duvida')
    expect(assuntoPelasRegras(['oi'], semPedido)).toBe('outro')
    expect(assuntoPelasRegras([''], semPedido)).toBe('outro')
  })
  it('a conversa toda conta (saudação e depois o pedido)', () => {
    expect(assuntoPelasRegras(['boa tarde', 'tudo bem?', 'queria 1000 panfletos'], semPedido)).toBe('orcamento')
  })
  it('o assunto nunca "desce" (pedido de orçamento continua, mesmo com um "obrigado" depois)', () => {
    expect(assuntoMaisImportante('orcamento', 'outro')).toBe('orcamento')
    expect(assuntoMaisImportante('duvida', 'pedido')).toBe('pedido')
    expect(assuntoMaisImportante('outro', 'duvida')).toBe('duvida')
  })
})

describe('Conversas do WhatsApp: leitura do Assistente (a mesma do classificar_resposta, sem custo a mais)', () => {
  it('intenção → assunto', () => {
    expect(assuntoDaLeitura('novo_pedido')).toBe('orcamento')
    expect(assuntoDaLeitura('sobre_pedido')).toBe('pedido')
    expect(assuntoDaLeitura('pergunta')).toBe('duvida')
    expect(assuntoDaLeitura('quer_modificacoes')).toBe('duvida')
    expect(assuntoDaLeitura('aprova')).toBe('outro')
    expect(assuntoDaLeitura('outro')).toBe('outro')
  })
  it('conversa nova: o prompt diz que não há orçamento, leva os pedidos em andamento e nunca o telefone', () => {
    const p = pedidoClassificarResposta({
      grafica: 'Ponto Visual',
      orcamento: null,
      pedidos: ['PED-2026-0012 · em producao · previsão 2026-10-27'],
      cliente: 'Ana',
      mensagem: 'oi, meu pedido já ficou pronto? meu número é (11) 98888-7777',
    })
    expect(p.tarefa).toBe('classificar_resposta')
    expect(p.conteudo).toContain('Nenhum orçamento aguardando')
    expect(p.conteudo).toContain('PED-2026-0012')
    expect(p.conteudo).not.toMatch(/98888|7777/)
    expect(p.sistema).toContain('novo_pedido')
    expect(p.sistema).toContain('sobre_pedido')
  })
  it('simulado: pedido novo (com e sem orçamento aberto) e pergunta de pedido', () => {
    const orcamento = { numero: 'ORC-2026-0102', itens: [{ descricao: 'Panfleto 10x15 couchê', quantidade: '1000', categoria: 'Impressos' }] }
    const caso = 'Oi, boa noite, quanto é o adesivo 2x1 fosco ou perfurado para colocar no carro e mil panfletos'
    expect(classificarSimulado(pedidoClassificarResposta({ grafica: 'G', orcamento, cliente: null, mensagem: caso }).conteudo)).toMatchObject({ intencao: 'novo_pedido' })
    expect(classificarSimulado(pedidoClassificarResposta({ grafica: 'G', orcamento: null, cliente: null, mensagem: 'quero 500 cartões' }).conteudo)).toMatchObject({ intencao: 'novo_pedido' })
    expect(classificarSimulado(pedidoClassificarResposta({ grafica: 'G', orcamento: null, cliente: null, mensagem: 'meu pedido já ficou pronto?' }).conteudo)).toMatchObject({ intencao: 'sobre_pedido' })
    // Resposta ao orçamento continua como antes
    expect(classificarSimulado(pedidoClassificarResposta({ grafica: 'G', orcamento, cliente: null, mensagem: 'tá ótimo, pode mandar ver' }).conteudo)).toMatchObject({ intencao: 'aprova' })
  })
})

describe('Conversas do WhatsApp: resposta pronta do pedido (só sai com o toque da pessoa)', () => {
  // 25/10/2026 é domingo
  const hoje = '2026-10-25'
  it('quando: hoje, amanhã, dia da semana e data', () => {
    expect(quandoFalar('2026-10-25', hoje)).toBe('hoje')
    expect(quandoFalar('2026-10-26', hoje)).toBe('amanhã')
    expect(quandoFalar('2026-10-30', hoje)).toBe('na sexta-feira (30/10)')
    expect(quandoFalar('2026-10-31', hoje)).toBe('no sábado (31/10)')
    expect(quandoFalar('2026-11-15', hoje)).toBe('no dia 15/11')
  })
  const ctx = { nome: 'Ana', hojeISO: hoje, grafica: 'Ponto Visual' }
  const pedido = { numero: 'PED-2026-0012', status: 'em_producao' as const, dataPrevistaEntrega: '2026-10-26', tipoEntrega: 'retirada' as const }
  it('em produção: fica pronto amanhã (com saudação e assinatura)', () => {
    expect(respostaProntaDoPedido(pedido, ctx)).toBe('Olá, Ana!\n\nSeu pedido *PED-2026-0012* está em produção e fica pronto amanhã.\n\n— Ponto Visual')
  })
  it('pronto, saiu para entrega, esperando arte e atrasado: sem prometer o que o sistema não sabe', () => {
    expect(respostaProntaDoPedido({ ...pedido, status: 'pronto' }, ctx)).toContain('já está pronto ✅ Pode vir buscar quando quiser.')
    expect(respostaProntaDoPedido({ ...pedido, status: 'pronto', tipoEntrega: 'entrega' }, ctx)).toContain('Em breve sai para entrega.')
    expect(respostaProntaDoPedido({ ...pedido, status: 'em_entrega' }, ctx)).toContain('já saiu para entrega')
    expect(respostaProntaDoPedido({ ...pedido, status: 'aguardando_arte' }, ctx)).toContain('esperando a arte')
    expect(respostaProntaDoPedido({ ...pedido, status: 'arte_em_aprovacao' }, ctx)).toContain('esperando a sua aprovação')
    const atrasado = respostaProntaDoPedido({ ...pedido, dataPrevistaEntrega: '2026-10-20' }, ctx)
    expect(atrasado).toContain('Avisamos por aqui assim que ficar pronto.')
    expect(atrasado).not.toContain('fica pronto')
    expect(respostaProntaDoPedido(pedido, { ...ctx, nome: null, grafica: null })).toBe('Olá!\n\nSeu pedido *PED-2026-0012* está em produção e fica pronto amanhã.')
  })
})
