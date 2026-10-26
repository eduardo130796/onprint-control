import { describe, expect, it, vi } from 'vitest'
import { EvolutionWhatsappProvider, LogWhatsappProvider } from '../src/integrations/whatsapp'
import { RegistroEnviosWhatsapp, comRegistro } from '../src/integrations/whatsapp/registro-envios'
import { DONO_PRESENTE_MS, silencioAoCliente } from '../src/modules/whatsapp/aprovacao'
import { formaDaConfirmacao, linhaCurtaItem, listaNumerada, moedaCurta, nomeCurto, textoAvisoOrcamento } from '../src/modules/whatsapp/copiloto'

describe('Avisos curtos', () => {
  it('só o nome do produto (sem gramatura, medidas e especificação)', () => {
    expect(nomeCurto('Banner em lona 440 g')).toBe('Banner')
    expect(nomeCurto('Panfleto 10 × 15 cm 4×0 couché 115 g')).toBe('Panfleto')
    expect(nomeCurto('Cartão de visita 4×4 couché 300 g')).toBe('Cartão de visita')
    expect(nomeCurto('Wind banner 2,5 m com base')).toBe('Wind banner')
    expect(nomeCurto('Placa em PVC 3 mm')).toBe('Placa')
    expect(nomeCurto('Adesivo vinil impresso')).toBe('Adesivo vinil impresso')
    expect(nomeCurto('Camiseta personalizada (sublimação)')).toBe('Camiseta personalizada')
  })
  it('valores sem ",00" e medidas enxutas', () => {
    expect(moedaCurta('320')).toBe('R$ 320')
    expect(moedaCurta('1234.00')).toBe('R$ 1.234')
    expect(moedaCurta('71.2')).toBe('R$ 71,20')
    expect(linhaCurtaItem({ descricao: 'Banner em lona 440 g', quantidade: '2', largura: '2', altura: '1', total: '320' })).toBe('2× Banner 2×1 m — R$ 320')
    expect(linhaCurtaItem({ descricao: 'Banner em lona 440 g', quantidade: '1', largura: '2.5', altura: '0.8', total: '199.9' })).toBe('1× Banner 2,5×0,8 m — R$ 199,90')
    expect(linhaCurtaItem({ descricao: 'Panfleto 10 × 15 cm', quantidade: '1000', total: '160' })).toBe('1.000× Panfleto — R$ 160')
  })
  it('no máximo 6 itens no aviso, com "… e mais N" (a numeração continua)', () => {
    const itens = Array.from({ length: 9 }, (_, k) => ({ descricao: `Item ${String.fromCharCode(65 + k)}`, quantidade: '1', total: '10' }))
    expect(listaNumerada(itens).split('\n')).toEqual(['1) 1× Item A — R$ 10', '2) 1× Item B — R$ 10', '3) 1× Item C — R$ 10', '4) 1× Item D — R$ 10', '5) 1× Item E — R$ 10', '6) 1× Item F — R$ 10', '… e mais 3'])
    const aviso = textoAvisoOrcamento({ numero: 'ORC-1', cliente: 'Ana', clienteNovo: false, itens, total: '90', conferir: [], link: 'http://x/1' }, 'reacao')
    expect(aviso.split('\n').slice(-3)).toEqual(['Total: *R$ 90*', 'Responda *ok* para enviar · ou ajuste (ex.: "10% de desconto")', 'http://x/1'])
  })
})

describe('Confirmação: reação ou texto', () => {
  it('deu certo e sem alerta: só a reação', () => {
    expect(formaDaConfirmacao('enviado', [null])).toEqual({ reacao: '✅', texto: null })
    expect(formaDaConfirmacao('cancelado', [])).toEqual({ reacao: '👍', texto: null })
    expect(formaDaConfirmacao('desfeito', [undefined, ''])).toEqual({ reacao: '↩️', texto: null })
  })
  it('com alerta (PDF que não foi, confirmação que já saiu): a reação e uma linha de texto', () => {
    expect(formaDaConfirmacao('enviado', ['ORC-1: O PDF não foi junto: mande pelo sistema se precisar.'])).toEqual({ reacao: '✅', texto: 'ORC-1: O PDF não foi junto: mande pelo sistema se precisar.' })
  })
  it('Evolution: POST /message/sendReaction/{instância} com a chave da mensagem e o emoji', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ key: { id: 'REACAO1' } }), { status: 201, headers: { 'content-type': 'application/json' } }))
    const p = new EvolutionWhatsappProvider('http://evolution:8080', 'chave', fetcher)
    expect(await p.reagir('grafygo-e1', { remoteJid: '5519988973398@s.whatsapp.net', fromMe: true, id: 'OK1' }, '✅')).toEqual({ id: 'REACAO1' })
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://evolution:8080/message/sendReaction/grafygo-e1')
    expect(JSON.parse(init.body as string)).toEqual({ key: { remoteJid: '5519988973398@s.whatsapp.net', fromMe: true, id: 'OK1' }, reaction: '✅' })
  })
  it('a reação fica no registro de envios (o eco não vira mensagem do dono)', async () => {
    const registro = new RegistroEnviosWhatsapp()
    const p = comRegistro(new LogWhatsappProvider(), registro)
    const r = await p.reagir('i', { remoteJid: '5519988973398@s.whatsapp.net', fromMe: true, id: 'OK1' }, '✅')
    expect(registro.ehDoSistema({ idMensagem: r.id!, numero: null, texto: null })).toBe(true)
  })
})

describe('Resposta automática ao cliente: quieto quando o dono está na conversa', () => {
  const agora = new Date('2026-10-26T15:00:00Z')
  it('o dono escreveu nos últimos 30 minutos: não responde', () => {
    expect(silencioAoCliente({ peloAssistente: false, semClientes: false, ultimaDoDonoEm: new Date(agora.getTime() - 5 * 60_000), agora })).toBe('dono_presente')
    expect(silencioAoCliente({ peloAssistente: false, semClientes: false, ultimaDoDonoEm: new Date(agora.getTime() - DONO_PRESENTE_MS - 1000), agora })).toBeNull()
    expect(silencioAoCliente({ peloAssistente: false, semClientes: false, ultimaDoDonoEm: null, agora })).toBeNull()
  })
  it('"Nunca falar com meus clientes" continua valendo para o que o Assistente decidiu', () => {
    expect(silencioAoCliente({ peloAssistente: true, semClientes: true, ultimaDoDonoEm: null, agora })).toBe('sem_clientes')
    expect(silencioAoCliente({ peloAssistente: false, semClientes: true, ultimaDoDonoEm: null, agora })).toBeNull()
  })
})
