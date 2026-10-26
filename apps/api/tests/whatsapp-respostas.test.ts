import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { OPCOES_ENQUETE_ORCAMENTO } from '@onprint/shared'
import { buildApp } from '../src/app'
import { carregarEnv } from '../src/config/env'
import { EvolutionWhatsappProvider, LogWhatsappProvider, bytesDoWhatsapp } from '../src/integrations/whatsapp'
import { identidadeDasCredenciais, urlDoBancoEvolution } from '../src/integrations/whatsapp/credenciais-evolution'
import { abrirVoto, abrirVotoComIdentidades, cifrarVoto, jidNormalizado, lerPollVote, mascararJid, opcoesDoVoto, votoBrutoParaGuardar, votoDoBruto } from '../src/modules/whatsapp/enquete'
import {
  CONFIANCA_OUTRO_ASSUNTO,
  JANELA_RESPOSTA_MS,
  MAX_RESPOSTAS_ANTERIORES,
  SILENCIO_NOTIFICACAO_MS,
  aprovacaoClara,
  decidirPeloAssistente,
  decidirResposta,
  desempilharResposta,
  empilharResposta,
  intencaoDaOpcao,
  intencaoDoTexto,
  numeroDaResposta,
  vaiParaAssistente,
  variantesDoNumero,
  type LeituraAssistente,
  type OrcamentoEnviado,
  type Recebida,
  type RespostaGuardada,
} from '../src/modules/whatsapp/respostas'
import { empresaDaInstancia, lerAvisoWebhook, numeroDoJid, segredoDaEmpresa, segredoDoServidor, urlDoWebhook } from '../src/modules/whatsapp/webhook'

const OPCOES = Object.values(OPCOES_ENQUETE_ORCAMENTO)
const agora = new Date('2026-10-24T15:00:00Z')

describe('WhatsApp respostas: o que o texto do cliente pede', () => {
  it.each(['aprovado', 'APROVADO', 'Aprovado!', 'aprovo', 'Pode fazer', 'ok aprovado', 'ok, aprovado 👍', '✅ Aprovado', 'Aprovadíssimo', 'pode mandar fazer', 'Fechado!', 'tá aprovado, obrigado'])(
    '"%s" aprova',
    (t) => expect(intencaoDoTexto(t)).toBe('aprovar'),
  )
  it.each(['não aprovado', 'Nao aprovo', 'ainda não', 'n aprovado', 'nem pensar', 'não, pode fazer não'])('"%s" (negação) nunca aprova', (t) => expect(intencaoDoTexto(t)).toBe('indefinida'))
  it.each(['quero mudar a cor', 'Quero modificações', 'aprovado, mas troca a fonte', 'dá pra aumentar o tamanho?', 'tem desconto?', 'pode alterar o telefone'])('"%s" pede modificação', (t) =>
    expect(intencaoDoTexto(t)).toBe('modificar'),
  )
  it.each(['bom dia', 'ok', 'sim', 'aprovado?', 'quanto fica?', 'vou ver com meu sócio', ''])('"%s" fica para a equipe', (t) => expect(intencaoDoTexto(t)).toBe('indefinida'))

  it('opção da enquete', () => {
    expect(intencaoDaOpcao([OPCOES_ENQUETE_ORCAMENTO.aprovar])).toBe('aprovar')
    expect(intencaoDaOpcao([OPCOES_ENQUETE_ORCAMENTO.modificar])).toBe('modificar')
    expect(intencaoDaOpcao([])).toBe('sem_voto')
    expect(intencaoDaOpcao(OPCOES)).toBe('indefinida')
  })

  it.each([
    ['1', 1],
    [' 1 ', 1],
    ['1.', 1],
    ['1️⃣', 1],
    ['1⃣', 1],
    ['2', 2],
    ['2.', 2],
    ['2️⃣', 2],
  ])('"%s" é a resposta numérica %s', (t, n) => expect(numeroDaResposta(t)).toBe(n))
  it.each(['3', '12', '1 banner', 'opção 1', '1,', '1!', '01', '', 'um'])('"%s" não é resposta numérica', (t) => expect(numeroDaResposta(t)).toBeNull())
  it('o número sozinho não tem intenção como texto (só vale pelo formato do orçamento)', () => {
    expect(intencaoDoTexto('1')).toBe('indefinida')
    expect(intencaoDoTexto('2')).toBe('indefinida')
  })

  it('número com e sem o 9º dígito', () => {
    expect(variantesDoNumero('5511988887777')).toEqual(['5511988887777', '551188887777'])
    expect(variantesDoNumero('551188887777')).toEqual(['551188887777', '5511988887777'])
    expect(variantesDoNumero('551133334444')).toEqual(['551133334444'])
  })
})

const orc = (o: Partial<OrcamentoEnviado> = {}): OrcamentoEnviado => ({
  mensagemId: 'm1',
  orcamentoId: 'o1',
  numero: 'ORC-1',
  status: 'enviado',
  idExterno: 'TXT1',
  enqueteId: 'POLL1',
  formatoResposta: 'enquete',
  enviadaEm: new Date(agora.getTime() - 3_600_000),
  resposta: null,
  respostaEm: null,
  respostaIdExterno: null,
  ...o,
})
const voto = (opcoes: string[] | null, idMensagem = 'V1', idEnquete = 'POLL1'): Recebida => ({ tipo: 'voto', idMensagem, idEnquete, opcoes })
const texto = (t: string, citadoId: string | null = null, idMensagem = 'T1'): Recebida => ({ tipo: 'texto', idMensagem, texto: t, citadoId })
const ligado = { aprovarSozinho: true, agora }

describe('WhatsApp respostas: decisão', () => {
  it('voto "Aprovado" aprova exatamente o orçamento da enquete', () => {
    const d = decidirResposta(voto([OPCOES_ENQUETE_ORCAMENTO.aprovar]), [orc({ enqueteId: 'OUTRA', orcamentoId: 'o2', mensagemId: 'm2' }), orc()], ligado)
    expect(d).toMatchObject({ acao: 'aprovar', alvo: { orcamentoId: 'o1' }, resposta: 'aprovado' })
  })
  it('"aprovar sozinho" desligado: só avisa a equipe', () => {
    expect(decidirResposta(voto([OPCOES_ENQUETE_ORCAMENTO.aprovar]), [orc()], { ...ligado, aprovarSozinho: false })).toMatchObject({ acao: 'notificar', motivo: 'aprovacao_manual' })
  })
  it('voto "Quero modificações": negociação e a resposta ao cliente uma vez só', () => {
    expect(decidirResposta(voto([OPCOES_ENQUETE_ORCAMENTO.modificar]), [orc()], ligado)).toMatchObject({ acao: 'modificar', responderCliente: true })
    const jaPediu = orc({ status: 'em_negociacao', resposta: 'modificacoes', respostaEm: new Date(agora.getTime() - 60_000), respostaIdExterno: 'T0' })
    expect(decidirResposta(texto('quero mudar a cor'), [jaPediu], ligado)).toMatchObject({ acao: 'modificar', responderCliente: false })
  })
  it('mesmo voto duas vezes (webhook repetido) não faz nada', () => {
    expect(decidirResposta(voto([OPCOES_ENQUETE_ORCAMENTO.aprovar], 'V1'), [orc({ respostaIdExterno: 'V1' })], ligado)).toEqual({ acao: 'ignorar', motivo: 'repetida' })
  })
  it('depois de aprovado: "Aprovado" de novo é ignorado; mudar o voto não desfaz, só avisa', () => {
    expect(decidirResposta(voto([OPCOES_ENQUETE_ORCAMENTO.aprovar], 'V2'), [orc({ status: 'convertido' })], ligado)).toMatchObject({ acao: 'ignorar', motivo: 'já aprovado' })
    expect(decidirResposta(voto([OPCOES_ENQUETE_ORCAMENTO.modificar], 'V3'), [orc({ status: 'aprovado' })], ligado)).toMatchObject({ acao: 'notificar', motivo: 'depois_de_aprovado' })
  })
  it('voto retirado é ignorado; voto que não abriu avisa a equipe; enquete desconhecida é ignorada', () => {
    expect(decidirResposta(voto([]), [orc()], ligado).acao).toBe('ignorar')
    expect(decidirResposta(voto(null), [orc()], ligado)).toMatchObject({ acao: 'notificar', motivo: 'voto_ilegivel' })
    expect(decidirResposta(voto([OPCOES_ENQUETE_ORCAMENTO.aprovar], 'V1', 'X'), [orc()], ligado)).toMatchObject({ acao: 'ignorar', motivo: 'enquete desconhecida' })
  })
  it('orçamento recusado ou expirado: avisa a equipe', () => {
    expect(decidirResposta(texto('aprovado', 'TXT1'), [orc({ status: 'expirado' })], ligado)).toMatchObject({ acao: 'notificar', motivo: 'fechado' })
  })

  it('texto citando a mensagem do orçamento vale para ele, mesmo com outros abertos', () => {
    const d = decidirResposta(texto('Aprovado', 'TXT2'), [orc(), orc({ orcamentoId: 'o2', mensagemId: 'm2', idExterno: 'TXT2', enqueteId: 'P2' })], ligado)
    expect(d).toMatchObject({ acao: 'aprovar', alvo: { orcamentoId: 'o2' } })
  })
  it('texto sem citar: o único orçamento aberto enviado ao número nos últimos 30 dias', () => {
    expect(decidirResposta(texto('pode fazer'), [orc()], ligado)).toMatchObject({ acao: 'aprovar', alvo: { orcamentoId: 'o1' } })
    // Dois envios do mesmo orçamento contam como um (vale o mais recente)
    const reenvio = orc({ mensagemId: 'm9', enviadaEm: new Date(agora.getTime() - 60_000) })
    expect(decidirResposta(texto('pode fazer'), [orc(), reenvio], ligado)).toMatchObject({ acao: 'aprovar', alvo: { mensagemId: 'm9' } })
    const antigo = orc({ enviadaEm: new Date(agora.getTime() - JANELA_RESPOSTA_MS - 1) })
    expect(decidirResposta(texto('aprovado'), [antigo], ligado)).toMatchObject({ acao: 'ignorar' })
  })
  it('dois orçamentos abertos e texto sem citar: não aprova nenhum, avisa a equipe', () => {
    const d = decidirResposta(texto('aprovado'), [orc(), orc({ orcamentoId: 'o2', mensagemId: 'm2', numero: 'ORC-2', idExterno: 'TXT2', enqueteId: 'P2' })], ligado)
    expect(d).toMatchObject({ acao: 'notificar', motivo: 'varios', resposta: 'outra' })
    if (d.acao === 'notificar') expect(d.alvos.map((a) => a.numero)).toEqual(['ORC-1', 'ORC-2'])
  })
  it('sem orçamento aberto para o número: conversa normal, nada acontece', () => {
    expect(decidirResposta(texto('bom dia'), [], ligado).acao).toBe('ignorar')
    expect(decidirResposta(texto('aprovado'), [orc({ status: 'rascunho' })], ligado).acao).toBe('ignorar')
  })
  it('texto sem intenção clara: avisa a equipe, sem repetir o aviso logo em seguida', () => {
    expect(decidirResposta(texto('vou ver com meu sócio'), [orc()], ligado)).toMatchObject({ acao: 'notificar', motivo: 'texto', avisarEquipe: true })
    const recente = orc({ resposta: 'outra', respostaEm: new Date(agora.getTime() - SILENCIO_NOTIFICACAO_MS / 2), respostaIdExterno: 'T0' })
    expect(decidirResposta(texto('e o prazo?', null, 'T5'), [recente], ligado)).toMatchObject({ acao: 'notificar', avisarEquipe: false })
  })
  it('"não aprovado" nunca aprova (fica para a equipe)', () => {
    expect(decidirResposta(texto('não aprovado'), [orc()], ligado)).toMatchObject({ acao: 'notificar', motivo: 'texto' })
  })
})

describe('WhatsApp respostas: "Responder 1 ou 2"', () => {
  const numeros = (o: Partial<OrcamentoEnviado> = {}) => orc({ formatoResposta: 'numeros', enqueteId: null, ...o })
  it('"1" aprova e "2" pede modificação no único orçamento aberto que saiu pedindo 1/2', () => {
    expect(decidirResposta(texto('1'), [numeros()], ligado)).toMatchObject({ acao: 'aprovar', alvo: { orcamentoId: 'o1' }, resposta: 'aprovado' })
    expect(decidirResposta(texto('1.'), [numeros()], ligado)).toMatchObject({ acao: 'aprovar' })
    expect(decidirResposta(texto('1️⃣'), [numeros()], ligado)).toMatchObject({ acao: 'aprovar' })
    expect(decidirResposta(texto('2'), [numeros()], ligado)).toMatchObject({ acao: 'modificar', resposta: 'modificacoes', responderCliente: true })
    expect(decidirResposta(texto(' 2. '), [numeros()], ligado)).toMatchObject({ acao: 'modificar' })
  })
  it('"1" com "aprovar sozinho" desligado: só avisa a equipe', () => {
    expect(decidirResposta(texto('1'), [numeros()], { ...ligado, aprovarSozinho: false })).toMatchObject({ acao: 'notificar', motivo: 'aprovacao_manual', resposta: 'aprovado' })
  })
  it('"1" citando a mensagem do orçamento vale para ele, mesmo com outros abertos', () => {
    const d = decidirResposta(texto('1', 'TXT2'), [orc(), numeros({ orcamentoId: 'o2', mensagemId: 'm2', idExterno: 'TXT2' })], ligado)
    expect(d).toMatchObject({ acao: 'aprovar', alvo: { orcamentoId: 'o2' } })
  })
  it('número nunca conta para orçamento que saiu com enquete, só texto ou antes da escolha: fica para a equipe', () => {
    expect(decidirResposta(texto('1'), [orc()], ligado)).toMatchObject({ acao: 'notificar', motivo: 'texto', resposta: 'outra' })
    expect(decidirResposta(texto('2'), [orc({ formatoResposta: 'texto' })], ligado)).toMatchObject({ acao: 'notificar', motivo: 'texto', resposta: 'outra' })
    expect(decidirResposta(texto('1'), [orc({ formatoResposta: null })], ligado)).toMatchObject({ acao: 'notificar', motivo: 'texto' })
    // Citando um orçamento com enquete, mesmo havendo outro que pediu 1/2
    expect(decidirResposta(texto('1', 'TXT1'), [orc(), numeros({ orcamentoId: 'o2', mensagemId: 'm2', idExterno: 'TXT2' })], ligado)).toMatchObject({ acao: 'notificar', motivo: 'texto', alvos: [{ orcamentoId: 'o1' }] })
  })
  it('"1" sem citar com dois orçamentos abertos (mesmo que só um pediu 1/2): não aprova nenhum, avisa a equipe', () => {
    const d = decidirResposta(texto('1'), [numeros(), orc({ orcamentoId: 'o2', mensagemId: 'm2', numero: 'ORC-2', idExterno: 'TXT2', enqueteId: 'P2' })], ligado)
    expect(d).toMatchObject({ acao: 'notificar', motivo: 'varios', resposta: 'outra' })
  })
  it('"1" sem orçamento aberto (ou fora dos 30 dias): conversa normal, nada acontece', () => {
    expect(decidirResposta(texto('1'), [], ligado).acao).toBe('ignorar')
    expect(decidirResposta(texto('1'), [numeros({ enviadaEm: new Date(agora.getTime() - JANELA_RESPOSTA_MS - 1) })], ligado).acao).toBe('ignorar')
  })
  it('orçamento que pediu 1/2: o "aprovado" escrito também vale; texto com número no meio não é resposta numérica', () => {
    expect(decidirResposta(texto('aprovado'), [numeros()], ligado)).toMatchObject({ acao: 'aprovar' })
    expect(decidirResposta(texto('quero mudar a cor'), [numeros()], ligado)).toMatchObject({ acao: 'modificar' })
    expect(decidirResposta(texto('1 banner a mais'), [numeros()], ligado)).toMatchObject({ acao: 'notificar', motivo: 'texto' })
    expect(decidirResposta(texto('3'), [numeros()], ligado)).toMatchObject({ acao: 'notificar', motivo: 'texto' })
  })
  it('depois de aprovado: "1" de novo é ignorado; "2" não desfaz, só avisa; webhook repetido não faz nada', () => {
    expect(decidirResposta(texto('1', 'TXT1', 'T2'), [numeros({ status: 'convertido' })], ligado)).toMatchObject({ acao: 'ignorar', motivo: 'já aprovado' })
    expect(decidirResposta(texto('2', 'TXT1', 'T3'), [numeros({ status: 'aprovado' })], ligado)).toMatchObject({ acao: 'notificar', motivo: 'depois_de_aprovado', resposta: 'modificacoes' })
    expect(decidirResposta(texto('1', null, 'T1'), [numeros({ respostaIdExterno: 'T1' })], ligado)).toEqual({ acao: 'ignorar', motivo: 'repetida' })
  })
  it('vale o formato do envio mais recente do mesmo orçamento', () => {
    const reenvioComEnquete = orc({ mensagemId: 'm9', enviadaEm: new Date(agora.getTime() - 60_000) })
    expect(decidirResposta(texto('1'), [numeros(), reenvioComEnquete], ligado)).toMatchObject({ acao: 'notificar', motivo: 'texto' })
    const reenvioNumeros = numeros({ mensagemId: 'm9', enviadaEm: new Date(agora.getTime() - 60_000) })
    expect(decidirResposta(texto('1'), [orc(), reenvioNumeros], ligado)).toMatchObject({ acao: 'aprovar', alvo: { mensagemId: 'm9' } })
  })
})

describe('WhatsApp respostas: aprovação natural (formato conversa, sem enquete)', () => {
  const conversa = (o: Partial<OrcamentoEnviado> = {}) => orc({ formatoResposta: 'conversa', enqueteId: null, ...o })
  const comAssistente = { ...ligado, assistente: true }

  it.each(['pode fazer', 'Pode fazer!', 'fechado', 'Fechado!', 'tá ótimo, pode mandar', 'show, pode seguir', 'aprovado', '👍', '👍🏻', '👌', '✅', '👍👍'])('"%s" aprova (com e sem o Assistente)', (t) => {
    expect(intencaoDoTexto(t)).toBe('aprovar')
    expect(aprovacaoClara(t)).toBe(true)
    expect(decidirResposta(texto(t), [conversa()], ligado)).toMatchObject({ acao: 'aprovar', resposta: 'aprovado' })
    expect(decidirResposta(texto(t), [conversa()], comAssistente)).toMatchObject({ acao: 'aprovar', resposta: 'aprovado' })
  })
  it.each([
    'pode fazer?',
    'fechado? qual o prazo?',
    'aprovado, mas dá pra entregar sexta?',
    'tá ótimo, quanto fica o frete?',
    '👍 e o prazo?',
    'show, aceita pix?',
    'quanto fica com 2 mil?',
    'qual o valor da entrega?',
    'pode fazer, quanto fica o total?',
  ])('"%s" (pergunta ou dúvida) nunca aprova', (t) => {
    expect(intencaoDoTexto(t)).not.toBe('aprovar')
    expect(aprovacaoClara(t)).toBe(false)
    for (const opcoes of [ligado, comAssistente]) expect(decidirResposta(texto(t), [conversa()], opcoes).acao).not.toBe('aprovar')
  })

  it('mensagem nova do cliente (o caso real) não é modificação nem apaga a resposta anterior', () => {
    const nova = 'Oi, boa noite, quanto é o adesivo 2x1 fosco ou perfurado para colocar no carro e mil panfletos'
    expect(intencaoDoTexto(nova)).toBe('indefinida')
    const jaPediu = conversa({ status: 'em_negociacao', resposta: 'modificacoes', respostaEm: new Date(agora.getTime() - 3_600_000), respostaIdExterno: 'T0' })
    // Sem o Assistente: fica para a equipe (nunca "modificações" pelas palavras)
    expect(decidirResposta(texto(nova, null, 'T9'), [jaPediu], ligado)).toMatchObject({ acao: 'notificar', motivo: 'texto', resposta: 'outra' })
    // Com o Assistente: ele lê
    const d = decidirResposta(texto(nova, null, 'T9'), [jaPediu], comAssistente)
    expect(vaiParaAssistente(d, texto(nova, null, 'T9'))).toBe(true)
  })
  it('palavras genéricas ("colocar", "incluir", "aumentar") só são mudança fora de pergunta de preço', () => {
    expect(intencaoDoTexto('pode colocar meu telefone embaixo')).toBe('modificar')
    expect(intencaoDoTexto('dá pra aumentar o tamanho?')).toBe('modificar')
    expect(intencaoDoTexto('quanto fica para incluir 500 cartões?')).toBe('indefinida')
    expect(intencaoDoTexto('qual o valor para colocar ilhós')).toBe('indefinida')
    // Pedido de mudança claro continua, mesmo com pergunta
    expect(intencaoDoTexto('tem desconto?')).toBe('modificar')
    expect(intencaoDoTexto('quanto fica se trocar o papel?')).toBe('modificar')
  })
  it('com o Assistente: as regras só decidem o óbvio (aprovação curta e clara e o 1/2 do formato números)', () => {
    const um = [conversa()]
    expect(decidirResposta(texto('quero mudar a cor'), um, comAssistente)).toMatchObject({ acao: 'notificar', motivo: 'texto', resposta: 'outra' })
    const longa = 'aprovado, pode fazer igual ao do ano passado com o logo novo que mandei semana passada'
    expect(decidirResposta(texto(longa), um, ligado).acao).toBe('aprovar')
    expect(decidirResposta(texto(longa), um, comAssistente)).toMatchObject({ acao: 'notificar', motivo: 'texto' })
    expect(decidirResposta(texto('aprovado, se for entregue até sexta'), um, comAssistente)).toMatchObject({ acao: 'notificar' })
    const numeros = [orc({ formatoResposta: 'numeros', enqueteId: null })]
    expect(decidirResposta(texto('1'), numeros, comAssistente)).toMatchObject({ acao: 'aprovar' })
    expect(decidirResposta(texto('2'), numeros, comAssistente)).toMatchObject({ acao: 'modificar' })
    // Voto da enquete continua igual
    expect(decidirResposta(voto([OPCOES_ENQUETE_ORCAMENTO.modificar]), [orc()], comAssistente)).toMatchObject({ acao: 'modificar' })
    // Fechado ou já aprovado: como antes (a equipe vê)
    expect(decidirResposta(texto('quero mudar a cor', 'TXT1'), [conversa({ idExterno: 'TXT1', status: 'aprovado' })], comAssistente)).toMatchObject({ acao: 'notificar', motivo: 'depois_de_aprovado', resposta: 'modificacoes' })
  })

  it('leitura do Assistente: pedido novo ou pergunta de outro pedido sai do orçamento (vai para as Conversas)', () => {
    const base = { acao: 'notificar' as const, motivo: 'texto' as const, alvos: [conversa()], resposta: 'outra' as const, avisarEquipe: true }
    const ler = (intencao: LeituraAssistente['intencao'], confianca: number): LeituraAssistente => ({ intencao, confianca, resumo: 'O cliente pediu preço de adesivo.', temPergunta: true })
    expect(decidirPeloAssistente(ler('novo_pedido', 0.9), 'quanto é o adesivo?', base, ligado)).toMatchObject({ acao: 'outro_assunto', alvo: { orcamentoId: 'o1' }, assistente: { intencao: 'novo_pedido' } })
    expect(decidirPeloAssistente(ler('sobre_pedido', CONFIANCA_OUTRO_ASSUNTO), 'o outro pedido tá pronto?', base, ligado).acao).toBe('outro_assunto')
    // Pouca certeza: avisa a equipe com o resumo, como antes
    expect(decidirPeloAssistente(ler('novo_pedido', 0.6), 'e o adesivo?', base, ligado)).toMatchObject({ acao: 'notificar', motivo: 'assistente' })
  })

  it('respostas em sequência: a anterior vai para a lista e volta quando a nova não era resposta', () => {
    const r = (resposta: string, idExterno: string): RespostaGuardada => ({ resposta, via: 'texto', texto: idExterno, em: agora.toISOString(), idExterno, intencao: null, confianca: null, resumo: null })
    expect(empilharResposta(null, null, 'T1')).toBeNull()
    // A mesma mensagem ("lendo" → leitura) não empilha
    expect(empilharResposta(null, r('outra', 'T1'), 'T1')).toBeNull()
    const lista = empilharResposta(null, r('modificacoes', 'T1'), 'T2')!
    expect(lista.map((x) => x.idExterno)).toEqual(['T1'])
    const mais = empilharResposta(lista, r('outra', 'T2'), 'T3')!
    expect(mais.map((x) => x.idExterno)).toEqual(['T1', 'T2'])
    expect(empilharResposta('lixo', r('outra', 'T2'), 'T3')).toHaveLength(1)
    const muitas = Array.from({ length: MAX_RESPOSTAS_ANTERIORES + 5 }, (_, i) => r('outra', `X${i}`))
    expect(empilharResposta(muitas, r('outra', 'Y'), 'Z')).toHaveLength(MAX_RESPOSTAS_ANTERIORES)
    expect(desempilharResposta(mais)).toEqual({ volta: mais[1], ficam: [mais[0]] })
    expect(desempilharResposta(null)).toEqual({ volta: null, ficam: [] })
  })
})

describe('WhatsApp respostas: voto cifrado da enquete', () => {
  const segredo = randomBytes(32)
  const ctx = { idEnquete: '3EB0ABC', criadorJid: '5511900001111@s.whatsapp.net', votanteJid: '5511988887777@s.whatsapp.net', segredo }

  it('abre o voto (mesmo algoritmo do Baileys) e devolve o nome da opção', () => {
    const v = cifrarVoto([OPCOES_ENQUETE_ORCAMENTO.aprovar], ctx, randomBytes(12))
    expect(opcoesDoVoto(v, { idEnquete: ctx.idEnquete, segredo, opcoes: OPCOES, criadores: [ctx.criadorJid], votantes: [ctx.votanteJid] })).toEqual([OPCOES_ENQUETE_ORCAMENTO.aprovar])
  })
  it('tenta as combinações de jid (aparelho, LID): a autenticação do GCM confirma a certa', () => {
    const comLid = { ...ctx, criadorJid: '123456789012345@lid', votanteJid: '987654321098765@lid' }
    const v = cifrarVoto([OPCOES_ENQUETE_ORCAMENTO.modificar], comLid, randomBytes(12))
    const r = opcoesDoVoto(v, {
      idEnquete: ctx.idEnquete,
      segredo,
      opcoes: OPCOES,
      criadores: ['5511900001111:7@s.whatsapp.net', '123456789012345@lid'],
      votantes: ['5511988887777@s.whatsapp.net', '987654321098765:3@lid'],
    })
    expect(r).toEqual([OPCOES_ENQUETE_ORCAMENTO.modificar])
  })
  it('segredo ou jid errados: não abre (null); voto retirado abre como lista vazia', () => {
    const v = cifrarVoto([OPCOES_ENQUETE_ORCAMENTO.aprovar], ctx, randomBytes(12))
    expect(abrirVoto(v, { ...ctx, segredo: randomBytes(32) })).toBeNull()
    expect(opcoesDoVoto(v, { idEnquete: ctx.idEnquete, segredo, opcoes: OPCOES, criadores: [ctx.criadorJid], votantes: ['5511000000000@s.whatsapp.net'] })).toBeNull()
    expect(opcoesDoVoto(cifrarVoto([], ctx, randomBytes(12)), { idEnquete: ctx.idEnquete, segredo, opcoes: OPCOES, criadores: [ctx.criadorJid], votantes: [ctx.votanteJid] })).toEqual([])
  })
  it('jid sem aparelho e protobuf do voto', () => {
    expect(jidNormalizado('5511900001111:12@s.whatsapp.net')).toBe('5511900001111@s.whatsapp.net')
    expect(lerPollVote(Buffer.from([0x0a, 2, 1, 2, 0x10, 5]))).toEqual([Buffer.from([1, 2])])
  })
  it('bytes como a Evolution manda no JSON', () => {
    const esperado = Buffer.from([1, 2, 250])
    expect(bytesDoWhatsapp({ 0: 1, 1: 2, 2: 250 })).toEqual(esperado)
    expect(bytesDoWhatsapp({ type: 'Buffer', data: [1, 2, 250] })).toEqual(esperado)
    expect(bytesDoWhatsapp(esperado.toString('base64'))).toEqual(esperado)
    expect(bytesDoWhatsapp([1, 2, 250])).toEqual(esperado)
    expect(bytesDoWhatsapp({ a: 1 })).toBeNull()
    expect(bytesDoWhatsapp(null)).toBeNull()
  })
})

/**
 * O que o WhatsApp do cliente faz ao votar, escrito como no Baileys 7 (decryptPollVote ao contrário, sem usar
 * enquete.ts): sign = idEnquete + criador + votante + "Poll Vote" + 0x01; key0 = HMAC(zeros, messageSecret);
 * chave = HMAC(key0, sign); AES-256-GCM com aad = idEnquete + "\0" + votante; saída = cifrado + etiqueta.
 * PollVoteMessage: campo 1 (bytes) = SHA-256 do nome de cada opção.
 */
function votoComoOWhatsapp(opcoes: string[], c: { idEnquete: string; criadorJid: string; votanteJid: string; segredo: Buffer }) {
  const sign = Buffer.concat([Buffer.from(c.idEnquete), Buffer.from(c.criadorJid), Buffer.from(c.votanteJid), Buffer.from('Poll Vote'), new Uint8Array([1])])
  const key0 = createHmac('sha256', new Uint8Array(32)).update(c.segredo).digest()
  const chave = createHmac('sha256', key0).update(sign).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', chave, iv)
  cipher.setAAD(Buffer.from(`${c.idEnquete}\u0000${c.votanteJid}`))
  const claro = Buffer.concat(opcoes.map((o) => Buffer.concat([Buffer.from([0x0a, 32]), createHash('sha256').update(o).digest()])))
  return { encPayload: Buffer.concat([cipher.update(claro), cipher.final(), cipher.getAuthTag()]), encIv: iv }
}

describe('WhatsApp respostas: voto no endereçamento novo (LID)', () => {
  const segredo = randomBytes(32)
  const idEnquete = '3EB0F8EF16D4B9CFE25FD9'
  // Gráfica e cliente, cada um com número e LID (valores inventados)
  const grafica = { numero: '5511900001111@s.whatsapp.net', lid: '111122223333444@lid' }
  const cliente = { numero: '5511988887777@s.whatsapp.net', lid: '555566667777888@lid' }
  // O que a API sabe: o número e o LID guardados da gráfica; do cliente, o jid do envio e o LID visto no voto
  const conhecidos = {
    idEnquete,
    segredo,
    opcoes: OPCOES,
    criadores: [grafica.numero, '111122223333444:6@lid'],
    votantes: ['5511988887777:0@s.whatsapp.net', '555566667777888:12@lid'],
  }

  const combinacoes = [
    ['número/número', grafica.numero, cliente.numero],
    ['LID/LID', grafica.lid, cliente.lid],
    ['LID da gráfica/número do cliente', grafica.lid, cliente.numero],
    ['número da gráfica/LID do cliente', grafica.numero, cliente.lid],
  ] as const
  for (const [nome, criadorJid, votanteJid] of combinacoes) {
    it(`abre o voto cifrado com ${nome}`, () => {
      const v = votoComoOWhatsapp([OPCOES_ENQUETE_ORCAMENTO.aprovar], { idEnquete, criadorJid, votanteJid, segredo })
      expect(abrirVotoComIdentidades(v, conhecidos)).toEqual({ opcoes: [OPCOES_ENQUETE_ORCAMENTO.aprovar], criadorJid, votanteJid })
    })
  }

  it('enquete.ts cifra igual ao WhatsApp (cifrarVoto ↔ votoComoOWhatsapp)', () => {
    const c = { idEnquete, criadorJid: grafica.lid, votanteJid: cliente.lid, segredo }
    expect(opcoesDoVoto(cifrarVoto([OPCOES_ENQUETE_ORCAMENTO.modificar], c, randomBytes(12)), conhecidos)).toEqual([OPCOES_ENQUETE_ORCAMENTO.modificar])
    expect(abrirVoto(votoComoOWhatsapp([OPCOES_ENQUETE_ORCAMENTO.modificar], c), c)).toHaveLength(1)
  })

  it('regressão (teste real de 25/10): criador = LID da gráfica; sem o LID guardado não abre, com ele abre', () => {
    const v = votoComoOWhatsapp([OPCOES_ENQUETE_ORCAMENTO.aprovar], { idEnquete, criadorJid: grafica.lid, votanteJid: cliente.lid, segredo })
    // Webhook como chegou: a Evolution trocou key.remoteJid "@lid" pelo número (remoteJid = remoteJidAlt); o LID do
    // cliente só sobra na chave da enquete (cleanMessage do Baileys: remoteJid = conversa, fromMe = true)
    const indexado = (b: Buffer) => Object.fromEntries([...b].map((x, i) => [String(i), x]))
    const aviso = lerAvisoWebhook(
      envelope('messages.upsert', {
        key: { remoteJid: cliente.numero, remoteJidAlt: cliente.numero, fromMe: false, id: 'AC12EF16DC55D1669CBB', participant: '', addressingMode: 'lid' },
        pushName: 'Cliente',
        messageType: 'pollUpdateMessage',
        message: {
          pollUpdateMessage: {
            pollCreationMessageKey: { remoteJid: cliente.lid, fromMe: true, id: idEnquete, participant: '' },
            vote: { encPayload: indexado(v.encPayload), encIv: indexado(v.encIv) },
            senderTimestampMs: { low: 1, high: 0, unsigned: false },
          },
        },
      }),
    )
    const e = aviso.eventos[0]
    expect(e).toMatchObject({ tipo: 'voto', idEnquete, numero: '5511988887777', opcoes: null })
    if (e?.tipo !== 'voto' || !e.cifrado) throw new Error('voto não lido')
    expect(e.votantes).toContain(cliente.lid)
    expect(e.chaveEnquete).toEqual({ remoteJid: cliente.lid, participant: null, fromMe: true })
    const base = { idEnquete, segredo, opcoes: OPCOES, votantes: [...e.votantes, cliente.numero] }
    // Antes: só o número da gráfica (sender e whatsapp_config.numero)
    expect(opcoesDoVoto(e.cifrado, { ...base, criadores: [...e.criadores, grafica.numero] })).toBeNull()
    // Agora: com o LID da conta (whatsapp_config.lid, lido das credenciais da instância)
    expect(opcoesDoVoto(e.cifrado, { ...base, criadores: [...e.criadores, grafica.numero, grafica.lid] })).toEqual([OPCOES_ENQUETE_ORCAMENTO.aprovar])
  })

  it('voto guardado que não abriu (voto_bruto) abre depois, quando o LID da gráfica aparece', () => {
    const v = votoComoOWhatsapp([OPCOES_ENQUETE_ORCAMENTO.modificar], { idEnquete, criadorJid: grafica.lid, votanteJid: cliente.lid, segredo })
    const bruto = votoBrutoParaGuardar({
      idMensagem: 'VOTO1',
      idEnquete,
      cifrado: v,
      votantes: [cliente.numero, cliente.lid],
      criadores: [grafica.numero],
      chaveEnquete: { remoteJid: cliente.lid, participant: null, fromMe: true },
      grafica: [grafica.numero],
      recebidoEm: '2026-10-25T12:00:00.000Z',
    })
    // Passa pelo banco (jsonb) e volta
    const lido = votoDoBruto(JSON.parse(JSON.stringify(bruto)))
    expect(lido).not.toBeNull()
    expect(lido!.cifrado).toEqual(v)
    expect(opcoesDoVoto(lido!.cifrado, { idEnquete, segredo, opcoes: OPCOES, criadores: lido!.criadores, votantes: lido!.votantes })).toBeNull()
    expect(opcoesDoVoto(lido!.cifrado, { idEnquete, segredo, opcoes: OPCOES, criadores: [...lido!.criadores, grafica.lid], votantes: lido!.votantes })).toEqual([OPCOES_ENQUETE_ORCAMENTO.modificar])
    expect(votoDoBruto({ qualquer: 1 })).toBeNull()
  })

  it('log sem o número inteiro; jid sem aparelho nem agente', () => {
    expect(mascararJid('5511988887777@s.whatsapp.net')).toBe('…7777@s.whatsapp.net')
    expect(mascararJid('555566667777888@lid')).toBe('…7888@lid')
    expect(mascararJid(null)).toBeNull()
    expect(jidNormalizado('555566667777888:12@lid')).toBe('555566667777888@lid')
    expect(jidNormalizado('5511900001111_1:3@s.whatsapp.net')).toBe('5511900001111@s.whatsapp.net')
    expect(jidNormalizado('5511900001111@c.us')).toBe('5511900001111@s.whatsapp.net')
  })

  it('LID da conta nas credenciais da instância (tabela "Session" da Evolution: JSON dentro de string, com aparelho)', () => {
    const creds = { noiseKey: { private: { type: 'Buffer', data: 'AAAA' } }, me: { id: '5511900001111:6@s.whatsapp.net', lid: '111122223333444:6@lid', name: 'Gráfica' } }
    expect(identidadeDasCredenciais(JSON.stringify(JSON.stringify(creds)))).toEqual({ jid: grafica.numero, lid: grafica.lid })
    expect(identidadeDasCredenciais(JSON.stringify(creds))).toEqual({ jid: grafica.numero, lid: grafica.lid })
    expect(identidadeDasCredenciais({ me: { id: '5511900001111:6@s.whatsapp.net' } })).toEqual({ jid: grafica.numero, lid: null })
    expect(identidadeDasCredenciais('não é json')).toBeNull()
    expect(identidadeDasCredenciais(null)).toBeNull()
    expect(urlDoBancoEvolution({ DATABASE_URL: 'postgresql://u:s@db:5432/onprint?schema=public' })).toBe('postgresql://u:s@db:5432/evolution?schema=public&connection_limit=1')
    expect(urlDoBancoEvolution({ DATABASE_URL: 'postgresql://u:s@db:5432/onprint', EVOLUTION_DATABASE_URL: 'postgresql://e:e@outro:5432/evo' })).toBe('postgresql://e:e@outro:5432/evo')
  })

  it('Evolution: identidade da conta vem do leitor das credenciais (sem leitor, desconhecida)', async () => {
    const creds = JSON.stringify(JSON.stringify({ me: { id: '5511900001111:6@s.whatsapp.net', lid: '111122223333444:6@lid' } }))
    const ler = vi.fn(async () => creds)
    const p = new EvolutionWhatsappProvider('http://evolution:8080', 'chave', vi.fn(), 1000, ler)
    expect(await p.identidade('grafygo-e1')).toEqual({ jid: grafica.numero, lid: grafica.lid })
    expect(ler).toHaveBeenCalledWith('grafygo-e1')
    expect(await new EvolutionWhatsappProvider('http://evolution:8080', 'chave', vi.fn()).identidade('grafygo-e1')).toBeNull()
  })
})

/** Formatos reais do webhook da Evolution v2.3.7 (prepareMessage + EventController.emit) */
const envelope = (event: string, data: unknown) => ({
  event,
  instance: 'grafygo-e1',
  data,
  destination: 'http://api:3333/api/v1/publico/whatsapp/webhook/x',
  date_time: '2026-10-24T12:00:00.000Z',
  sender: '5511900001111@s.whatsapp.net',
  server_url: 'http://evolution:8080',
  apikey: null,
})

describe('WhatsApp respostas: leitura do webhook', () => {
  it('texto do cliente (extendedTextMessage já vira conversation) com a mensagem citada', () => {
    const a = lerAvisoWebhook(
      envelope('messages.upsert', {
        key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'ABCD' },
        pushName: 'Pet Feliz',
        message: { conversation: 'Aprovado!' },
        contextInfo: { stanzaId: 'TXT1', participant: '5511900001111@s.whatsapp.net', quotedMessage: { conversation: 'Segue o seu orçamento' } },
        messageType: 'conversation',
        messageTimestamp: 1761307200,
      }),
    )
    expect(a.instancia).toBe('grafygo-e1')
    expect(a.eventos).toEqual([{ tipo: 'texto', idMensagem: 'ABCD', texto: 'Aprovado!', citadoId: 'TXT1', numero: '5511988887777', nome: 'Pet Feliz', jid: '5511988887777@s.whatsapp.net', midia: null }])
  })
  it('conta no endereçamento novo (LID): o número vem do remoteJidAlt', () => {
    const a = lerAvisoWebhook(envelope('messages.upsert', { key: { remoteJid: '987654321098765@lid', remoteJidAlt: '5511988887777@s.whatsapp.net', fromMe: false, id: 'X1' }, message: { conversation: 'ok aprovado' } }))
    expect(a.eventos[0]).toMatchObject({ tipo: 'texto', numero: '5511988887777' })
  })
  it('nossas mensagens, grupos, status, listas, canais e reações ficam de fora', () => {
    const fora = [
      { key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: true, id: 'A' }, message: { conversation: 'oi' } },
      { key: { remoteJid: '120363@g.us', fromMe: false, id: 'B' }, message: { conversation: 'aprovado' } },
      { key: { remoteJid: 'status@broadcast', fromMe: false, id: 'C' }, message: { conversation: 'x' } },
      { key: { remoteJid: '5511988887777@broadcast', fromMe: false, id: 'E' }, message: { audioMessage: { seconds: 3 } } },
      { key: { remoteJid: '120363@newsletter', fromMe: false, id: 'F' }, message: { conversation: 'novidade' } },
      { key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'G' }, message: { reactionMessage: { text: '👍', key: { id: 'TXT1' } } } },
    ]
    for (const d of fora) expect(lerAvisoWebhook(envelope('messages.upsert', d)).eventos).toEqual([])
  })
  it('mídia: sem legenda vira só o tipo (Conversas); com legenda, texto com o tipo; LID sem número fica no jid', () => {
    const audio = lerAvisoWebhook(envelope('messages.upsert', { key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'D' }, pushName: 'Ana', message: { audioMessage: { seconds: 3 } } }))
    expect(audio.eventos).toEqual([{ tipo: 'midia', idMensagem: 'D', midia: 'audio', numero: '5511988887777', nome: 'Ana', jid: '5511988887777@s.whatsapp.net' }])
    const foto = lerAvisoWebhook(envelope('messages.upsert', { key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'H' }, message: { imageMessage: { caption: 'quanto fica um banner assim?' } } }))
    expect(foto.eventos[0]).toMatchObject({ tipo: 'texto', texto: 'quanto fica um banner assim?', midia: 'foto' })
    const lid = lerAvisoWebhook(envelope('messages.upsert', { key: { remoteJid: '987654321098765@lid', fromMe: false, id: 'I' }, message: { stickerMessage: {} } }))
    expect(lid.eventos[0]).toMatchObject({ tipo: 'midia', midia: 'figurinha', numero: null, jid: '987654321098765@lid' })
  })
  it('voto cifrado (a Evolution não guarda a enquete): bytes indexados e os jids para abrir', () => {
    const a = lerAvisoWebhook(
      envelope('messages.upsert', {
        key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'VOTO1' },
        pushName: 'Pet Feliz',
        messageType: 'pollUpdateMessage',
        message: {
          pollUpdateMessage: {
            pollCreationMessageKey: { remoteJid: '5511900001111@s.whatsapp.net', fromMe: false, id: 'POLL1' },
            vote: { encPayload: { 0: 1, 1: 2, 2: 3 }, encIv: { 0: 9, 1: 8 } },
            senderTimestampMs: '1761307200000',
          },
        },
      }),
    )
    expect(a.eventos[0]).toEqual({
      tipo: 'voto',
      idMensagem: 'VOTO1',
      idEnquete: 'POLL1',
      numero: '5511988887777',
      nome: 'Pet Feliz',
      opcoes: null,
      cifrado: { encPayload: Buffer.from([1, 2, 3]), encIv: Buffer.from([9, 8]) },
      // Chave da enquete sem a normalização do Baileys (fromMe false): entra nas duas listas
      votantes: ['5511988887777@s.whatsapp.net', '5511900001111@s.whatsapp.net'],
      criadores: ['5511900001111@s.whatsapp.net'],
      chaveEnquete: { remoteJid: '5511900001111@s.whatsapp.net', participant: null, fromMe: false },
    })
  })
  it('voto já aberto pela Evolution (selectedOptions com os nomes e pollUpdates)', () => {
    const a = lerAvisoWebhook(
      envelope('messages.upsert', {
        key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'VOTO2' },
        message: { pollUpdateMessage: { pollCreationMessageKey: { id: 'POLL1' }, vote: { selectedOptions: ['✅ Aprovado'] } } },
        pollUpdates: [
          { name: '✅ Aprovado', voters: ['5511988887777@s.whatsapp.net'] },
          { name: '✏️ Quero modificações', voters: [] },
        ],
      }),
    )
    expect(a.eventos[0]).toMatchObject({ tipo: 'voto', idEnquete: 'POLL1', opcoes: ['✅ Aprovado'] })
  })
  it('conexão: open/close com o número', () => {
    expect(lerAvisoWebhook(envelope('connection.update', { instance: 'grafygo-e1', state: 'open', wuid: '5511900001111@s.whatsapp.net', profileName: 'Gráfica' })).eventos).toEqual([
      { tipo: 'conexao', estado: 'conectado', numero: '5511900001111', nomePerfil: 'Gráfica' },
    ])
    expect(lerAvisoWebhook(envelope('CONNECTION_UPDATE', { state: 'close', statusReason: 401 })).eventos[0]).toMatchObject({ estado: 'desconectado' })
    expect(lerAvisoWebhook({ nada: true })).toEqual({ instancia: null, eventos: [] })
  })
  it('número só de jid de telefone; instância nossa; segredo por empresa; endereço interno', () => {
    expect(numeroDoJid('5511988887777:3@s.whatsapp.net')).toBe('5511988887777')
    expect(numeroDoJid('123@lid')).toBeNull()
    expect(empresaDaInstancia('grafygo-2c4c4a9b-0cbd')).toBe('2c4c4a9b-0cbd')
    expect(empresaDaInstancia('outra-coisa')).toBeNull()
    const s = segredoDoServidor({ WHATSAPP_WEBHOOK_SEGREDO: '', JWT_ACCESS_SECRET: 'jwt-teste' })
    expect(s).toBe(segredoDoServidor({ WHATSAPP_WEBHOOK_SEGREDO: '', JWT_ACCESS_SECRET: 'jwt-teste' }))
    expect(s).not.toBe(segredoDoServidor({ WHATSAPP_WEBHOOK_SEGREDO: '', JWT_ACCESS_SECRET: 'outro' }))
    expect(segredoDoServidor({ WHATSAPP_WEBHOOK_SEGREDO: 'fixo', JWT_ACCESS_SECRET: 'jwt' })).toBe('fixo')
    expect(segredoDaEmpresa(s, 'e1')).toHaveLength(40)
    expect(segredoDaEmpresa(s, 'e1')).not.toBe(segredoDaEmpresa(s, 'e2'))
    expect(urlDoWebhook({ WHATSAPP_WEBHOOK_URL: '', PORT: 3333 }, 'abc')).toBe('http://api:3333/api/v1/publico/whatsapp/webhook/abc')
    expect(urlDoWebhook({ WHATSAPP_WEBHOOK_URL: 'http://api-interna:9000/api/v1/', PORT: 3333 }, 'abc')).toBe('http://api-interna:9000/api/v1/publico/whatsapp/webhook/abc')
  })
})

const respostaJson = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })

describe('WhatsApp respostas: Evolution (enquete e webhook)', () => {
  it('enquete: POST /message/sendPoll/{instância} de uma escolha; guarda id, segredo e jid', async () => {
    const segredo = randomBytes(32)
    const indexado = Object.fromEntries([...segredo].map((b, i) => [String(i), b]))
    const fetcher = vi.fn(async () =>
      respostaJson(201, {
        key: { remoteJid: '551188887777@s.whatsapp.net', fromMe: true, id: 'POLL9' },
        message: { messageContextInfo: { messageSecret: indexado }, pollCreationMessageV3: { name: 'Aprovar o orçamento ORC-1?', options: [{ optionName: '✅ Aprovado' }], selectableOptionsCount: 1 } },
        messageType: 'pollCreationMessageV3',
      }),
    )
    const p = new EvolutionWhatsappProvider('http://evolution:8080', 'chave', fetcher)
    expect(await p.enviarEnquete('grafygo-e1', '5511988887777', 'Aprovar o orçamento ORC-1?', OPCOES)).toEqual({ id: 'POLL9', segredo: segredo.toString('base64'), jid: '551188887777@s.whatsapp.net' })
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://evolution:8080/message/sendPoll/grafygo-e1')
    expect(JSON.parse(init.body as string)).toEqual({ number: '5511988887777', name: 'Aprovar o orçamento ORC-1?', selectableCount: 1, values: OPCOES })
  })
  it('webhook: POST /webhook/set/{instância} só com MESSAGES_UPSERT e CONNECTION_UPDATE, sem base64', async () => {
    const fetcher = vi.fn(async () => respostaJson(201, { id: 'w1', enabled: true }))
    const p = new EvolutionWhatsappProvider('http://evolution:8080', 'chave', fetcher)
    await p.configurarWebhook('grafygo-e1', 'http://api:3333/api/v1/publico/whatsapp/webhook/s')
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://evolution:8080/webhook/set/grafygo-e1')
    expect(JSON.parse(init.body as string)).toEqual({
      webhook: { enabled: true, url: 'http://api:3333/api/v1/publico/whatsapp/webhook/s', events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'], byEvents: false, base64: false },
    })
  })
  it('modo de teste registra a enquete com id e segredo de verdade', async () => {
    const log = new LogWhatsappProvider()
    const r = await log.enviarEnquete('grafygo-e1', '5511988887777', 'Aprovar?', OPCOES)
    expect(r.id).toMatch(/^log-/)
    expect(Buffer.from(r.segredo!, 'base64')).toHaveLength(32)
    expect(log.enquetes).toHaveLength(1)
  })
})

describe('WhatsApp respostas: autenticação do webhook (sem banco)', () => {
  const config = carregarEnv({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://x:x@localhost:1/x', JWT_ACCESS_SECRET: 'segredo-de-teste', JWT_REFRESH_SECRET: 'segredo-de-teste-2', LOG_LEVEL: 'silent' })
  let app: Awaited<ReturnType<typeof buildApp>>
  const segredoE1 = segredoDaEmpresa(segredoDoServidor(config), 'e1')

  beforeAll(async () => {
    app = await buildApp(config)
    app.empresas.porId = async (id) => (id === 'e1' ? { id: 'e1', nome: 'Gráfica Teste', slug: 'grafica-teste', schema: 'emp_teste' } : null)
    await app.ready()
  })
  afterAll(() => app.close())

  const enviar = (segredo: string, corpo: unknown) => app.inject({ method: 'POST', url: `/api/v1/publico/whatsapp/webhook/${segredo}`, payload: corpo as object })

  it('segredo errado, de outra empresa ou instância que não é nossa: 401', async () => {
    expect((await enviar('errado', envelope('messages.upsert', {}))).statusCode).toBe(401)
    expect((await enviar(segredoDaEmpresa(segredoDoServidor(config), 'e2'), envelope('messages.upsert', {}))).statusCode).toBe(401)
    expect((await enviar(segredoE1, { ...envelope('messages.upsert', {}), instance: 'outra' })).statusCode).toBe(401)
  })
  it('segredo certo: 200 (sem eventos de interesse, nada a fazer)', async () => {
    const r = await enviar(segredoE1, envelope('messages.update', [{ keyId: 'x', status: 'READ' }]))
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ recebido: true, eventos: [] })
  })
  it('instância de empresa que não existe mais: 200 e ignora', async () => {
    const s = segredoDaEmpresa(segredoDoServidor(config), 'sumiu')
    const r = await enviar(s, { ...envelope('messages.upsert', { key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'A' }, message: { conversation: 'aprovado' } }), instance: 'grafygo-sumiu' })
    expect(r.statusCode).toBe(200)
    expect(r.json().eventos).toEqual([])
  })
})
