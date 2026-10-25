import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { OPCOES_ENQUETE_ORCAMENTO } from '@onprint/shared'
import { buildApp } from '../src/app'
import { carregarEnv } from '../src/config/env'
import { EvolutionWhatsappProvider, LogWhatsappProvider, bytesDoWhatsapp } from '../src/integrations/whatsapp'
import { abrirVoto, cifrarVoto, jidNormalizado, lerPollVote, opcoesDoVoto } from '../src/modules/whatsapp/enquete'
import {
  JANELA_RESPOSTA_MS,
  SILENCIO_NOTIFICACAO_MS,
  decidirResposta,
  intencaoDaOpcao,
  intencaoDoTexto,
  numeroDaResposta,
  variantesDoNumero,
  type OrcamentoEnviado,
  type Recebida,
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
    expect(a.eventos).toEqual([{ tipo: 'texto', idMensagem: 'ABCD', texto: 'Aprovado!', citadoId: 'TXT1', numero: '5511988887777', nome: 'Pet Feliz' }])
  })
  it('conta no endereçamento novo (LID): o número vem do remoteJidAlt', () => {
    const a = lerAvisoWebhook(envelope('messages.upsert', { key: { remoteJid: '987654321098765@lid', remoteJidAlt: '5511988887777@s.whatsapp.net', fromMe: false, id: 'X1' }, message: { conversation: 'ok aprovado' } }))
    expect(a.eventos[0]).toMatchObject({ tipo: 'texto', numero: '5511988887777' })
  })
  it('nossas mensagens, grupos, status e mídia sem legenda ficam de fora', () => {
    const fora = [
      { key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: true, id: 'A' }, message: { conversation: 'oi' } },
      { key: { remoteJid: '120363@g.us', fromMe: false, id: 'B' }, message: { conversation: 'aprovado' } },
      { key: { remoteJid: 'status@broadcast', fromMe: false, id: 'C' }, message: { conversation: 'x' } },
      { key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'D' }, message: { audioMessage: { seconds: 3 } } },
    ]
    for (const d of fora) expect(lerAvisoWebhook(envelope('messages.upsert', d)).eventos).toEqual([])
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
      votantes: ['5511988887777@s.whatsapp.net'],
      criadores: ['5511900001111@s.whatsapp.net', '5511900001111@s.whatsapp.net'],
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
