import { describe, expect, it } from 'vitest'
import {
  AVISO_VALE_MS,
  OK_SOLTO_MS,
  PERGUNTA_VALE_MS,
  combinaComReferencia,
  ehCanalVoce,
  ehEcoDoAssistente,
  ehReacaoDeOrcamento,
  escolherParaCancelar,
  escolherParaEnviar,
  interpretarVoce,
  nomeDoPedido,
  selecionarMensagens,
  textoAvisoOrcamento,
  textoEstado,
  textoPergunta,
  type MensagemCliente,
  type RascunhoCanal,
} from '../src/modules/whatsapp/copiloto'
import { lerAvisoWebhook } from '../src/modules/whatsapp/webhook'

const agora = new Date('2026-10-26T17:00:00Z')
const antes = (ms: number) => new Date(agora.getTime() - ms)
const min = 60_000

function rascunho(p: Partial<RascunhoCanal> & { orcamentoId: string }): RascunhoCanal {
  return {
    numero: `ORC-2026-0${p.orcamentoId.padStart(3, '0')}`,
    cliente: 'Eduardo Júnior',
    total: '552.00',
    status: 'rascunho',
    criadoEm: antes(5 * min),
    avisadoEm: antes(5 * min),
    atualizadoEm: antes(5 * min),
    enviadoEm: null,
    enviadoNoSistemaEm: null,
    descartadoEm: null,
    liberacaoPendente: false,
    ...p,
  }
}

const envelope = (data: unknown) => ({ event: 'messages.upsert', instance: 'grafygo-e1', sender: '5519988973398@s.whatsapp.net', data })

describe('Copiloto: reação 📝', () => {
  it('aceita 📝 e ✍ com qualquer tom de pele e com/sem o seletor FE0F', () => {
    for (const e of ['📝', '📝\u{FE0F}', '\u{270D}\u{FE0F}', '\u{270D}', '\u{270D}🏻', '\u{270D}🏿', '\u{270D}\u{FE0F}\u{1F3FD}']) expect(ehReacaoDeOrcamento(e)).toBe(true)
    for (const e of ['👍', '\u{2764}\u{FE0F}', '', null, '📝📝', '✅']) expect(ehReacaoDeOrcamento(e)).toBe(false)
  })
  it('webhook: reação do dono vira "reacao"; a removida (texto vazio) e a do cliente não', () => {
    const dono = lerAvisoWebhook(
      envelope({
        key: { remoteJid: '5511988887777@s.whatsapp.net', remoteJidAlt: '5511988887777@s.whatsapp.net', fromMe: true, id: 'R1', addressingMode: 'lid' },
        messageType: 'reactionMessage',
        message: { reactionMessage: { key: { id: 'MSG1', remoteJid: '5511988887777@s.whatsapp.net', fromMe: false }, text: '📝' } },
      }),
    )
    expect(dono.sender).toBe('5519988973398@s.whatsapp.net')
    expect(dono.eventos).toEqual([
      { tipo: 'reacao', idMensagem: 'R1', emoji: '📝', idReagida: 'MSG1', reagidaMinha: false, jid: '5511988887777@s.whatsapp.net', jids: ['5511988887777@s.whatsapp.net', '5511988887777@s.whatsapp.net'], numero: '5511988887777' },
    ])
    const removida = lerAvisoWebhook(envelope({ key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: true, id: 'R2' }, message: { reactionMessage: { key: { id: 'MSG1' }, text: '' } } }))
    expect(removida.eventos).toEqual([])
    const doCliente = lerAvisoWebhook(envelope({ key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'R3' }, message: { reactionMessage: { key: { id: 'X' }, text: '📝' } } }))
    expect(doCliente.eventos).toEqual([])
  })
  it('webhook: mensagem do próprio número vira "proprio" (com a citação e o arquivo da nota)', () => {
    const texto = lerAvisoWebhook(envelope({ key: { remoteJid: '5519988973398@s.whatsapp.net', fromMe: true, id: 'V1' }, messageType: 'conversation', message: { conversation: ' ok ' }, contextInfo: { stanzaId: 'AV1' } }))
    expect(texto.eventos[0]).toMatchObject({ tipo: 'proprio', idMensagem: 'V1', texto: 'ok', citadoId: 'AV1', midia: null, jid: '5519988973398@s.whatsapp.net' })
    const pdf = lerAvisoWebhook(envelope({ key: { remoteJid: '5519988973398@s.whatsapp.net', fromMe: true, id: 'V2' }, message: { documentMessage: { mimetype: 'application/pdf', fileName: 'nota.pdf' } } }))
    expect(pdf.eventos[0]).toMatchObject({ tipo: 'proprio', midia: 'documento', arquivo: { mime: 'application/pdf', nome: 'nota.pdf' } })
  })
})

describe('Copiloto: canal "Você" e anti-laço', () => {
  const conta = { numero: '5519988973398', lid: '123456789012345@lid' }
  it('é o "Você" o número conectado (com e sem o 9º dígito) ou o LID da própria conta', () => {
    expect(ehCanalVoce(['5519988973398@s.whatsapp.net'], conta)).toBe(true)
    expect(ehCanalVoce(['551988973398@s.whatsapp.net'], conta)).toBe(true)
    expect(ehCanalVoce(['123456789012345:12@lid'], conta)).toBe(true)
    expect(ehCanalVoce(['5511988887777@s.whatsapp.net'], conta)).toBe(false)
    expect(ehCanalVoce(['999999999999999@lid'], conta)).toBe(false)
    // Sem número guardado: o "sender" do webhook vale
    expect(ehCanalVoce(['5519988973398@s.whatsapp.net'], { numero: null, lid: null, sender: '5519988973398@s.whatsapp.net' })).toBe(true)
    expect(ehCanalVoce(['5519988973398@s.whatsapp.net'], { numero: null, lid: null })).toBe(false)
  })
  it('o eco do que o Assistente mandou é ignorado (pelo id ou pelo texto recém-enviado)', () => {
    const enviados = { ids: new Set(['AV1']), textos: ['✅ ORC-2026-0105 enviado para Eduardo Júnior (R$ 552,00).'] }
    expect(ehEcoDoAssistente({ idMensagem: 'AV1', texto: 'qualquer' }, enviados)).toBe(true)
    expect(ehEcoDoAssistente({ idMensagem: 'X', texto: '✅ ORC-2026-0105 enviado para  Eduardo Júnior (R$ 552,00). ' }, enviados)).toBe(true)
    expect(ehEcoDoAssistente({ idMensagem: 'X', texto: 'ok' }, enviados)).toBe(false)
  })
})

describe('Copiloto: o que o dono escreveu', () => {
  it('"ok", "envia", "pode mandar" (e com referência)', () => {
    for (const t of ['ok', 'OK!', 'Ok.', 'envia', 'pode mandar', 'Manda', 'pode enviar', '👍']) expect(interpretarVoce(t)).toEqual({ tipo: 'enviar', ref: null })
    expect(interpretarVoce('ok 0105')).toEqual({ tipo: 'enviar', ref: '0105' })
    expect(interpretarVoce('ok Eduardo')).toEqual({ tipo: 'enviar', ref: 'eduardo' })
    expect(interpretarVoce('envia o da Ana')).toEqual({ tipo: 'enviar', ref: 'ana' })
  })
  it('cancelar, escolha (1/2/todos), ajuste e o resto', () => {
    expect(interpretarVoce('cancela')).toEqual({ tipo: 'cancelar', ref: null })
    expect(interpretarVoce('não envia')).toEqual({ tipo: 'cancelar', ref: null })
    expect(interpretarVoce('descarta 0106')).toEqual({ tipo: 'cancelar', ref: '0106' })
    expect(interpretarVoce('2')).toEqual({ tipo: 'escolha', opcoes: [2] })
    expect(interpretarVoce('1 e 2')).toEqual({ tipo: 'escolha', opcoes: [1, 2] })
    expect(interpretarVoce('todos')).toEqual({ tipo: 'escolha', opcoes: 'todos' })
    expect(interpretarVoce('tira os panfletos')).toEqual({ tipo: 'ajuste' })
    expect(interpretarVoce('10% de desconto')).toEqual({ tipo: 'ajuste' })
    expect(interpretarVoce('quem está devendo?')).toEqual({ tipo: 'outro' })
    expect(interpretarVoce('orçamento pra Ana: 2 banners 2x1')).toEqual({ tipo: 'outro' })
    expect(interpretarVoce('ok, faz um orçamento pra Ana de 2 banners 2x1 com ilhós')).toEqual({ tipo: 'outro' })
  })
  it('referência pelo fim do número ou pelo nome do cliente', () => {
    const r = rascunho({ orcamentoId: '105', numero: 'ORC-2026-0105', cliente: 'Eduardo Júnior' })
    expect(combinaComReferencia(r, '0105')).toBe(true)
    expect(combinaComReferencia(r, '105')).toBe(true)
    expect(combinaComReferencia(r, 'ORC-2026-0105')).toBe(true)
    expect(combinaComReferencia(r, '0106')).toBe(false)
    expect(combinaComReferencia(r, 'eduardo')).toBe(true)
    expect(combinaComReferencia(r, 'junior')).toBe(true)
    expect(combinaComReferencia(r, 'ana')).toBe(false)
  })
})

describe('Copiloto: qual orçamento o "ok" envia', () => {
  const ok = { tipo: 'enviar' as const, ref: null }
  const base = { citado: null, pergunta: null, agora }

  it('citando o aviso: exatamente aquele orçamento, mesmo havendo outros pendentes', () => {
    const a = rascunho({ orcamentoId: '105' })
    const b = rascunho({ orcamentoId: '106', cliente: 'Ana' })
    const d = escolherParaEnviar(ok, { ...base, citado: { orcamentoId: '105', em: antes(5 * min) }, rascunhos: [a, b] })
    expect(d).toEqual({ acao: 'enviar', rascunhos: [a] })
  })
  it('citando um aviso de orçamento que já foi enviado/aprovado/descartado: só diz o estado (nunca reenvia)', () => {
    for (const r of [
      rascunho({ orcamentoId: '105', status: 'enviado', enviadoNoSistemaEm: antes(30 * min) }),
      rascunho({ orcamentoId: '105', enviadoEm: antes(min) }),
      rascunho({ orcamentoId: '105', status: 'aprovado' }),
      rascunho({ orcamentoId: '105', status: 'convertido' }),
      rascunho({ orcamentoId: '105', descartadoEm: antes(min) }),
    ]) {
      expect(escolherParaEnviar(ok, { ...base, citado: { orcamentoId: '105', em: antes(5 * min) }, rascunhos: [r] }).acao).toBe('estado')
    }
    expect(escolherParaEnviar(ok, { ...base, citado: { orcamentoId: '999', em: antes(min) }, rascunhos: [] })).toEqual({ acao: 'apagado' })
  })
  it('editado no sistema depois do aviso: pede outro ok com o resumo atual', () => {
    const r = rascunho({ orcamentoId: '105', avisadoEm: antes(10 * min), atualizadoEm: antes(2 * min) })
    expect(escolherParaEnviar(ok, { ...base, citado: { orcamentoId: '105', em: antes(10 * min) }, rascunhos: [r] })).toEqual({ acao: 'confirmar', rascunho: r, motivo: 'mudou' })
    expect(escolherParaEnviar(ok, { ...base, rascunhos: [r] })).toEqual({ acao: 'confirmar', rascunho: r, motivo: 'mudou' })
  })
  it('aviso com mais de 2 horas: citando, confirma antes; solto, nunca vale', () => {
    const r = rascunho({ orcamentoId: '105', criadoEm: antes(AVISO_VALE_MS + min), avisadoEm: antes(AVISO_VALE_MS + min), atualizadoEm: antes(AVISO_VALE_MS + min) })
    expect(escolherParaEnviar(ok, { ...base, citado: { orcamentoId: '105', em: r.avisadoEm! }, rascunhos: [r] })).toEqual({ acao: 'confirmar', rascunho: r, motivo: 'antigo' })
    expect(escolherParaEnviar(ok, { ...base, rascunhos: [r] })).toEqual({ acao: 'nenhum', antigos: [r] })
  })
  it('"ok" solto: só com exatamente um pendente avisado nos últimos 30 minutos', () => {
    const recente = rascunho({ orcamentoId: '105' })
    const velho = rascunho({ orcamentoId: '104', criadoEm: antes(OK_SOLTO_MS + min), avisadoEm: antes(OK_SOLTO_MS + min), atualizadoEm: antes(OK_SOLTO_MS + min) })
    const enviado = rascunho({ orcamentoId: '103', status: 'enviado' })
    expect(escolherParaEnviar(ok, { ...base, rascunhos: [velho, enviado, recente] })).toEqual({ acao: 'enviar', rascunhos: [recente] })
    expect(escolherParaEnviar(ok, { ...base, rascunhos: [velho, enviado] })).toEqual({ acao: 'nenhum', antigos: [velho] })
    expect(escolherParaEnviar(ok, { ...base, rascunhos: [] })).toEqual({ acao: 'nenhum', antigos: [] })
  })
  it('"ok" solto com mais de um pendente recente: pergunta (e "1"/"2"/"todos" responde)', () => {
    const a = rascunho({ orcamentoId: '105' })
    const b = rascunho({ orcamentoId: '106', cliente: 'Ana', total: '320.00', criadoEm: antes(2 * min), avisadoEm: antes(2 * min), atualizadoEm: antes(2 * min) })
    expect(escolherParaEnviar(ok, { ...base, rascunhos: [a, b] })).toEqual({ acao: 'perguntar', rascunhos: [a, b] })
    const pergunta = { opcoes: ['105', '106'], em: antes(min) }
    expect(escolherParaEnviar({ tipo: 'escolha', opcoes: [2] }, { ...base, pergunta, rascunhos: [a, b] })).toEqual({ acao: 'enviar', rascunhos: [b] })
    expect(escolherParaEnviar({ tipo: 'escolha', opcoes: 'todos' }, { ...base, pergunta, rascunhos: [a, b] })).toEqual({ acao: 'enviar', rascunhos: [a, b] })
    expect(escolherParaEnviar({ tipo: 'escolha', opcoes: [3] }, { ...base, pergunta, rascunhos: [a, b] })).toEqual({ acao: 'escolha_invalida', motivo: 'opcao' })
    // A pergunta expira em 10 minutos
    expect(escolherParaEnviar({ tipo: 'escolha', opcoes: [1] }, { ...base, pergunta: { ...pergunta, em: antes(PERGUNTA_VALE_MS + 1) }, rascunhos: [a, b] })).toEqual({ acao: 'escolha_invalida', motivo: 'sem_pergunta' })
    expect(escolherParaEnviar({ tipo: 'escolha', opcoes: [1] }, { ...base, rascunhos: [a, b] })).toEqual({ acao: 'escolha_invalida', motivo: 'sem_pergunta' })
    // Escolhido que foi enviado pelo sistema depois da pergunta: só o estado
    expect(escolherParaEnviar({ tipo: 'escolha', opcoes: [1] }, { ...base, pergunta, rascunhos: [{ ...a, status: 'enviado' }, b] }).acao).toBe('estado')
  })
  it('"ok 0105" / "ok Eduardo": o pendente que combina (recente envia; antigo confirma; vários perguntam)', () => {
    const a = rascunho({ orcamentoId: '105' })
    const b = rascunho({ orcamentoId: '106', cliente: 'Ana' })
    expect(escolherParaEnviar({ tipo: 'enviar', ref: '0105' }, { ...base, rascunhos: [a, b] })).toEqual({ acao: 'enviar', rascunhos: [a] })
    expect(escolherParaEnviar({ tipo: 'enviar', ref: 'ana' }, { ...base, rascunhos: [a, b] })).toEqual({ acao: 'enviar', rascunhos: [b] })
    const antigo = rascunho({ orcamentoId: '107', criadoEm: antes(60 * min), avisadoEm: antes(60 * min), atualizadoEm: antes(60 * min) })
    expect(escolherParaEnviar({ tipo: 'enviar', ref: '0107' }, { ...base, rascunhos: [antigo] })).toEqual({ acao: 'confirmar', rascunho: antigo, motivo: 'pela_referencia' })
    const outroEduardo = rascunho({ orcamentoId: '108' })
    expect(escolherParaEnviar({ tipo: 'enviar', ref: 'eduardo' }, { ...base, rascunhos: [a, outroEduardo] }).acao).toBe('perguntar')
    expect(escolherParaEnviar({ tipo: 'enviar', ref: '0105' }, { ...base, rascunhos: [{ ...a, status: 'aprovado' }] }).acao).toBe('estado')
  })
  it('"cancela": citando ou com um só pendente recente; vários: pede para citar', () => {
    const a = rascunho({ orcamentoId: '105' })
    const b = rascunho({ orcamentoId: '106', cliente: 'Ana' })
    expect(escolherParaCancelar(null, { citado: null, rascunhos: [a], agora })).toEqual({ acao: 'descartar', rascunho: a })
    expect(escolherParaCancelar(null, { citado: { orcamentoId: '106', em: antes(min) }, rascunhos: [a, b], agora })).toEqual({ acao: 'descartar', rascunho: b })
    expect(escolherParaCancelar(null, { citado: null, rascunhos: [a, b], agora }).acao).toBe('citar')
    expect(escolherParaCancelar('ana', { citado: null, rascunhos: [a, b], agora })).toEqual({ acao: 'descartar', rascunho: b })
    expect(escolherParaCancelar(null, { citado: { orcamentoId: '105', em: antes(min) }, rascunhos: [{ ...a, status: 'enviado' }], agora }).acao).toBe('estado')
  })
})

describe('Copiloto: mensagens que entram no orçamento do 📝', () => {
  const m = (id: string, minutos: number, p: Partial<MensagemCliente> = {}): MensagemCliente => ({ idExterno: id, texto: `msg ${id}`, midia: null, recebidaEm: antes(minutos * min), usadaEm: null, tratada: false, ...p })

  it('a reagida é a âncora e entram as da mesma conversa, em ordem', () => {
    const conversa = [m('a', 10, { texto: 'oi, quanto fica' }), m('b', 9, { texto: '2 banners 2x1' }), m('c', 8, { texto: 'pra sexta' })]
    const s = selecionarMensagens('b', conversa, { ultimoEnvioEm: null })
    expect(s).toEqual({ ok: true, mensagens: conversa, texto: 'oi, quanto fica\n2 banners 2x1\npra sexta' })
  })
  it('nunca as que já viraram orçamento nem as de antes do último orçamento enviado', () => {
    const conversa = [m('a', 30, { texto: 'antigo: 500 panfletos' }), m('b', 20, { usadaEm: antes(15 * min), texto: 'já usada' }), m('c', 5, { texto: '1 banner' }), m('d', 4, { tratada: true, texto: 'aprovado' })]
    const s = selecionarMensagens('c', conversa, { ultimoEnvioEm: antes(25 * min) })
    expect(s.ok && s.texto).toBe('1 banner')
    expect(selecionarMensagens('b', conversa, { ultimoEnvioEm: null })).toEqual({ ok: false, motivo: 'usada' })
    expect(selecionarMensagens('a', conversa, { ultimoEnvioEm: antes(25 * min) })).toEqual({ ok: false, motivo: 'antiga' })
    expect(selecionarMensagens('zz', conversa, { ultimoEnvioEm: null })).toEqual({ ok: false, motivo: 'nao_encontrada' })
  })
  it('só foto ou áudio: sem texto para ler', () => {
    expect(selecionarMensagens('a', [m('a', 1, { texto: null, midia: 'foto' })], { ultimoEnvioEm: null })).toEqual({ ok: false, motivo: 'sem_texto' })
  })
  it('até 15 mensagens, as mais perto da reagida', () => {
    const conversa = Array.from({ length: 30 }, (_, i) => m(`m${i}`, 30 - i))
    const s = selecionarMensagens('m29', conversa, { ultimoEnvioEm: null })
    expect(s.ok && s.mensagens.map((x) => x.idExterno)).toEqual(Array.from({ length: 15 }, (_, i) => `m${i + 15}`))
  })
})

describe('Copiloto: textos do "Você"', () => {
  it('aviso do orçamento, pergunta e estado', () => {
    const aviso = textoAvisoOrcamento(
      {
        numero: 'ORC-2026-0105',
        cliente: 'Eduardo Júnior',
        clienteNovo: true,
        itens: [{ descricao: 'Banner', quantidade: '1', largura: '2', altura: '1.8', total: '272' }],
        total: '552',
        conferir: ['medida do banner'],
        link: 'http://x/orcamentos/1',
      },
      'reacao',
    )
    expect(aviso).toBe(
      [
        '📝 Orçamento ORC-2026-0105 para Eduardo Júnior (novo cliente):',
        '1) 1× Banner 2×1,8 m — R$ 272',
        'Total: *R$ 552*',
        'Confira: medida do banner',
        'Responda *ok* para enviar · ou ajuste (ex.: "10% de desconto")',
        'http://x/orcamentos/1',
      ].join('\n'),
    )
    expect(textoPergunta([rascunho({ orcamentoId: '105' }), rascunho({ orcamentoId: '106', numero: 'ORC-2026-0106', cliente: 'Ana', total: '320' })])).toBe(
      'Qual envio?\n1) ORC-2026-0105 · Eduardo Júnior · R$ 552,00\n2) ORC-2026-0106 · Ana · R$ 320,00\nResponda 1, 2 ou *todos*.',
    )
    expect(textoEstado(rascunho({ orcamentoId: '105', status: 'enviado', enviadoNoSistemaEm: new Date('2026-10-26T17:10:00Z') }), new Date('2026-10-26T18:00:00Z'))).toBe(
      'Esse orçamento já foi enviado pelo sistema às 14h10 (ORC-2026-0105).',
    )
  })
})

describe('Copiloto: o cliente do pedido no "Você" (sem IA)', () => {
  it('o nome depois do "pra", até os dois-pontos, a vírgula ou o número', () => {
    expect(nomeDoPedido('orçamento pra Ana: 2 banners 2x1')).toBe('Ana')
    expect(nomeDoPedido('Orçamento para a Padaria Sol, 500 panfletos')).toBe('Padaria Sol')
    expect(nomeDoPedido('orcamento pro Eduardo Júnior 11 98765-0002: 3 banners')).toBe('Eduardo Júnior')
    expect(nomeDoPedido('2 banners 2x1')).toBeNull()
    expect(nomeDoPedido('quem está devendo?')).toBeNull()
  })
})
