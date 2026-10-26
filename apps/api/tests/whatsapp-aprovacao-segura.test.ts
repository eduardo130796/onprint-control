import { describe, expect, it } from 'vitest'
import { LogWhatsappProvider } from '../src/integrations/whatsapp'
import { ECO_ENVIO_MS, RegistroEnviosWhatsapp, comRegistro } from '../src/integrations/whatsapp/registro-envios'
import {
  DESFAZER_MS,
  decidirAprovacaoAutomatica,
  impedimentoParaDesfazer,
  motivoDaConfirmacao,
  textoAprovadoAuto,
  textoConfirmarAprovacao,
  versaoDoOrcamento,
  type ContextoAprovacao,
  type OrcamentoParaVersao,
  type PedidoParaDesfazer,
} from '../src/modules/whatsapp/aprovacao'
import { interpretarVoce, rotaDoComando } from '../src/modules/whatsapp/copiloto'

const envio = new Date('2026-10-26T14:00:00Z')
const depois = (min: number) => new Date(envio.getTime() + min * 60_000)

const orcamento: OrcamentoParaVersao = {
  total: '552.00',
  desconto: '0',
  acrescimo: '0',
  frete: '0',
  sinalPercentual: '50',
  parcelas: 1,
  intervaloDias: 30,
  itens: [{ produtoId: 'banner', descricao: 'Banner', quantidade: '1', largura: '2', altura: '1.8', total: '552', acabamentos: [{ acabamentoId: 'b' }, { acabamentoId: 'a' }] }],
}
const versao = versaoDoOrcamento(orcamento)

const ctx = (c: Partial<ContextoAprovacao> = {}): ContextoAprovacao => ({
  aprovarSozinho: true,
  enviadaEm: envio,
  versaoEnviada: versao,
  versaoAtual: versao,
  orcamentoAtualizadoEm: depois(1),
  totalEnviado: '552.00',
  totalAtual: '552.00',
  mensagensDoDono: [],
  ...c,
})

describe('Aprovação pela resposta: só o caso limpo aprova sozinho', () => {
  it('nada mudou e ninguém conversou depois do envio: aprova', () => {
    expect(decidirAprovacaoAutomatica(ctx())).toEqual({ acao: 'aprovar' })
    // O dono conversou ANTES do envio: não conta
    expect(decidirAprovacaoAutomatica(ctx({ mensagensDoDono: [{ texto: 'te mando já', em: depois(-5) }] }))).toEqual({ acao: 'aprovar' })
    // Mudança só de status (marcado como enviado, em negociação) não muda a versão
    expect(decidirAprovacaoAutomatica(ctx({ orcamentoAtualizadoEm: depois(60) }))).toEqual({ acao: 'aprovar' })
  })
  it('o dono digitou algo depois do envio: a confirmar, com as 2 últimas mensagens', () => {
    const d = decidirAprovacaoAutomatica(ctx({ mensagensDoDono: [{ texto: 'oi', em: depois(1) }, { texto: 'faço por 500', em: depois(2) }, { texto: 'se fechar hoje', em: depois(3) }] }))
    expect(d).toEqual({ acao: 'confirmar', mudou: null, conversa: ['faço por 500', 'se fechar hoje'] })
  })
  it('o orçamento mudou depois do envio (outra versão): a confirmar, com os totais', () => {
    const outra = versaoDoOrcamento({ ...orcamento, total: '520.00', desconto: '32' })
    expect(outra).not.toBe(versao)
    expect(decidirAprovacaoAutomatica(ctx({ versaoAtual: outra, totalAtual: '520.00' }))).toEqual({ acao: 'confirmar', mudou: { antes: '552.00', agora: '520.00' }, conversa: [] })
  })
  it('envio de antes da versão gravada: vale a data da última alteração (com folga)', () => {
    expect(decidirAprovacaoAutomatica(ctx({ versaoEnviada: null, orcamentoAtualizadoEm: depois(2) }))).toEqual({ acao: 'aprovar' })
    expect(decidirAprovacaoAutomatica(ctx({ versaoEnviada: null, totalEnviado: null, orcamentoAtualizadoEm: depois(30) })).acao).toBe('confirmar')
  })
  it('"aprovar sozinho" desligado: nunca aprova sozinho', () => {
    expect(decidirAprovacaoAutomatica(ctx({ aprovarSozinho: false }))).toEqual({ acao: 'manual' })
  })
  it('a versão não depende da ordem dos acabamentos, mas muda com item, valor e pagamento', () => {
    expect(versaoDoOrcamento({ ...orcamento, itens: [{ ...orcamento.itens[0]!, acabamentos: [{ acabamentoId: 'a' }, { acabamentoId: 'b' }] }] })).toBe(versao)
    expect(versaoDoOrcamento({ ...orcamento, parcelas: 2 })).not.toBe(versao)
    expect(versaoDoOrcamento({ ...orcamento, itens: [{ ...orcamento.itens[0]!, quantidade: '2' }] })).not.toBe(versao)
  })
  it('textos: o aviso de confirmar no "Você", o motivo da faixa e o aviso da aprovação automática', () => {
    const conversa = { acao: 'confirmar' as const, mudou: null, conversa: ['faço por 500 se fechar hoje'] }
    expect(textoConfirmarAprovacao({ cliente: 'Eduardo Júnior', resposta: 'pode fazer', numero: 'ORC-2026-0112', total: '552.00', decisao: conversa, converteAoAprovar: true })).toBe(
      [
        'Eduardo Júnior respondeu “pode fazer” ao ORC-2026-0112 (R$ 552,00).',
        'Depois do envio vocês conversaram: “faço por 500 se fechar hoje”',
        '',
        'Responda *ok* a esta mensagem para virar pedido assim, ou ajuste antes ("faz por 500").',
      ].join('\n'),
    )
    const mudou = { acao: 'confirmar' as const, mudou: { antes: '552.00', agora: '520.00' }, conversa: [] }
    expect(textoConfirmarAprovacao({ cliente: 'Eduardo Júnior', resposta: 'pode fazer', numero: 'ORC-2026-0112', total: '520.00', decisao: mudou, converteAoAprovar: true })).toBe(
      [
        'Eduardo Júnior respondeu “pode fazer” ao ORC-2026-0112 (R$ 552,00).',
        'O orçamento mudou depois do envio (o cliente viu R$ 552,00; agora está R$ 520,00).',
        '',
        'Responda *ok* a esta mensagem para virar pedido assim, *reenvia* para mandar a versão nova ao cliente antes, ou ajuste antes ("faz por 500").',
      ].join('\n'),
    )
    expect(motivoDaConfirmacao(mudou)).toBe('o orçamento mudou depois do envio (o cliente viu R$ 552,00; agora está R$ 520,00)')
    expect(textoAprovadoAuto({ numero: 'ORC-2026-0112', cliente: 'Eduardo Júnior', total: '552', pedido: 'PED-2026-0070' })).toBe(
      '✅ ORC-2026-0112 aprovado por Eduardo Júnior e virou o PED-2026-0070 (R$ 552,00). Responda *desfazer* a esta mensagem em até 10 min se não era isso.',
    )
  })
})

describe('Mensagens do dono: o que o sistema mandou não conta como "conversaram"', () => {
  it('pelo id devolvido, pelo texto mandado há pouco ao mesmo número e pelo arquivo em andamento', () => {
    let agora = 0
    const r = new RegistroEnviosWhatsapp(() => agora)
    r.inicio('5511988887777', 'Segue o seu orçamento *ORC-1*')
    // O eco chegou antes do id: o texto (com e sem o 9º dígito no número) reconhece
    expect(r.ehDoSistema({ idMensagem: 'X', numero: '551188887777', texto: 'Segue o seu orçamento  *ORC-1*' })).toBe(true)
    // Arquivo (sem texto) durante o envio a esse número
    expect(r.ehDoSistema({ idMensagem: 'PDF', numero: '5511988887777', texto: null })).toBe(true)
    r.fim('5511988887777', 'ID1')
    expect(r.ehDoSistema({ idMensagem: 'ID1', numero: null, texto: null })).toBe(true)
    expect(r.ehDoSistema({ idMensagem: 'PDF2', numero: '5511988887777', texto: null })).toBe(false)
    // O dono digitando de verdade, ou o mesmo texto a outro número
    expect(r.ehDoSistema({ idMensagem: 'D1', numero: '5511988887777', texto: 'faço por 500' })).toBe(false)
    expect(r.ehDoSistema({ idMensagem: 'D2', numero: '5511900001111', texto: 'Segue o seu orçamento *ORC-1*' })).toBe(false)
    // Depois de 10 minutos o registro esquece
    agora = ECO_ENVIO_MS + 1
    expect(r.ehDoSistema({ idMensagem: 'ID1', numero: null, texto: null })).toBe(false)
  })
  it('o provedor anota cada envio (texto, documento, enquete)', async () => {
    const r = new RegistroEnviosWhatsapp()
    const p = comRegistro(new LogWhatsappProvider(), r)
    const t = await p.enviarTexto('i', '5511988887777', 'Perfeito, recebemos sua aprovação ✅')
    const d = await p.enviarDocumento('i', '5511988887777', { conteudo: Buffer.from('%PDF-1'), nomeArquivo: 'a.pdf', mime: 'application/pdf' })
    expect(r.ehDoSistema({ idMensagem: t.id!, numero: null, texto: null })).toBe(true)
    expect(r.ehDoSistema({ idMensagem: d.id!, numero: null, texto: null })).toBe(true)
    expect(r.ehDoSistema({ idMensagem: 'outro', numero: '5511988887777', texto: 'Perfeito, recebemos sua aprovação ✅' })).toBe(true)
    // O provedor de baixo continua o mesmo (modo de teste guarda o que "enviou")
    expect(p.simulado).toBe(true)
  })
})

describe('"ok" de confirmar aprovação × "ok" de enviar rascunho', () => {
  it('cada aviso tem o seu "ok"', () => {
    const ok = interpretarVoce('ok')
    expect(rotaDoComando(ok, 'confirmar_aprovacao')).toBe('aprovar')
    expect(rotaDoComando(ok, 'aviso')).toBe('rascunho')
    expect(rotaDoComando(ok, null)).toBe('rascunho')
    expect(rotaDoComando(ok, 'aprovado_auto')).toBe('ja_aprovado')
    expect(rotaDoComando(interpretarVoce('reenvia'), 'confirmar_aprovacao')).toBe('reenviar')
    expect(rotaDoComando(interpretarVoce('reenvia'), null)).toBe('reenviar_sem_citar')
    expect(rotaDoComando(interpretarVoce('cancela'), 'confirmar_aprovacao')).toBe('nao_aprovar')
    expect(rotaDoComando(interpretarVoce('faz por 500'), 'confirmar_aprovacao')).toBe('ajustar_aprovacao')
    expect(rotaDoComando(interpretarVoce('desfazer'), 'aprovado_auto')).toBe('desfazer')
    expect(interpretarVoce('Desfazer')).toEqual({ tipo: 'desfazer' })
    expect(interpretarVoce('manda de novo')).toEqual({ tipo: 'reenviar' })
  })
})

describe('"desfazer" a aprovação automática', () => {
  const aviso = new Date('2026-10-26T14:00:00Z')
  const pedido: PedidoParaDesfazer = { numero: 'PED-2026-0070', status: 'aguardando_arte', valorPago: '0', contasPagas: 0, opsIniciadas: 0, artesMexidas: 0 }
  const base = { avisoEm: aviso, agora: new Date(aviso.getTime() + 3 * 60_000), orcamentoStatus: 'convertido', pedido }
  it('dentro dos 10 minutos e com o pedido intocado: pode', () => {
    expect(impedimentoParaDesfazer(base)).toBeNull()
    expect(impedimentoParaDesfazer({ ...base, orcamentoStatus: 'aprovado', pedido: null })).toBeNull()
  })
  it('fora do prazo ou com o pedido já mexido: explica o porquê', () => {
    expect(impedimentoParaDesfazer({ ...base, agora: new Date(aviso.getTime() + DESFAZER_MS + 1000) })).toBe('já passaram os 10 minutos para desfazer por aqui')
    expect(impedimentoParaDesfazer({ ...base, pedido: { ...pedido, valorPago: '100' } })).toBe('o pedido PED-2026-0070 já tem pagamento')
    expect(impedimentoParaDesfazer({ ...base, pedido: { ...pedido, contasPagas: 1 } })).toBe('o pedido PED-2026-0070 já tem pagamento')
    expect(impedimentoParaDesfazer({ ...base, pedido: { ...pedido, opsIniciadas: 1 } })).toBe('a produção do PED-2026-0070 já começou')
    expect(impedimentoParaDesfazer({ ...base, pedido: { ...pedido, artesMexidas: 1 } })).toBe('a arte do PED-2026-0070 já foi mexida')
    expect(impedimentoParaDesfazer({ ...base, pedido: { ...pedido, status: 'pronto' } })).toBe('o pedido PED-2026-0070 já andou (está pronto)')
    expect(impedimentoParaDesfazer({ ...base, pedido: { ...pedido, status: 'cancelado' } })).toBe('o pedido PED-2026-0070 já está cancelado')
    expect(impedimentoParaDesfazer({ ...base, orcamentoStatus: 'em_negociacao' })).toBe('o orçamento não está mais aprovado')
  })
})
