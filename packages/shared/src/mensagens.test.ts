import { describe, expect, it } from 'vitest'
import { localEntrega, pixPagamento, proximoVencimento, resumoPagamento, valoresPedidoCompleto, type GraficaMensagem, type ParcelaMensagem, type PedidoMensagem } from './mensagens'
import { TEXTOS_PADRAO_MENSAGEM, preencherMensagem } from './whatsapp'

const HOJE = '2026-10-14'
const grafica: GraficaMensagem = { endereco: 'Rua das Flores, 123 - Centro - Campinas/SP', horario: 'Seg a sex, 8h às 18h', chavePix: '12.345.678/0001-90' }

describe('pagamento do pedido na mensagem', () => {
  it('quitado, parcial e nada pago', () => {
    expect(resumoPagamento('300', '300')).toBe('Pagamento: *quitado* ✅')
    expect(resumoPagamento('300', '350')).toBe('Pagamento: *quitado* ✅')
    expect(resumoPagamento('300', '100')).toBe('Pago: *R$ 100,00* · Falta: *R$ 200,00*')
    expect(resumoPagamento('300', '0')).toBe('A pagar: *R$ 300,00*')
    expect(resumoPagamento('0', '0')).toBe('')
  })
  it('centavos sem erro de ponto flutuante', () => {
    expect(resumoPagamento('0.3', '0.1')).toBe('Pago: *R$ 0,10* · Falta: *R$ 0,20*')
    expect(resumoPagamento('219.90', '219.9')).toBe('Pagamento: *quitado* ✅')
  })
})

describe('próxima parcela', () => {
  const parcela = (vencimento: string, valor: string, valorPago = '0', status = 'aberto'): ParcelaMensagem => ({ vencimento, valor, valorPago, status })
  it('a que vence primeiro (hoje ou depois), com o que falta dela', () => {
    const parcelas = [parcela('2026-11-14', '100'), parcela('2026-10-14', '100', '40', 'parcial'), parcela('2026-12-14', '100')]
    expect(proximoVencimento(parcelas, '300', '40', HOJE)).toBe('Próxima parcela: *R$ 60,00* em *14/10*')
  })
  it('vencida, paga ou cancelada não entra', () => {
    const parcelas = [parcela('2026-10-01', '100', '0', 'vencido'), parcela('2026-10-20', '100', '100', 'pago'), parcela('2026-10-21', '100', '0', 'cancelado'), parcela('2026-11-30', '100')]
    expect(proximoVencimento(parcelas, '300', '100', HOJE)).toBe('Próxima parcela: *R$ 100,00* em *30/11*')
    expect(proximoVencimento([parcela('2026-10-01', '100', '0', 'vencido')], '100', '0', HOJE)).toBe('')
  })
  it('pedido quitado ou sem parcelas: vazio', () => {
    expect(proximoVencimento([parcela('2026-11-14', '100')], '100', '100', HOJE)).toBe('')
    expect(proximoVencimento([], '100', '0', HOJE)).toBe('')
  })
})

describe('retirada, entrega e instalação', () => {
  it('retirada: endereço e horário da gráfica (o que houver)', () => {
    expect(localEntrega('retirada', null, grafica)).toBe('Retirada: Rua das Flores, 123 - Centro - Campinas/SP · Seg a sex, 8h às 18h')
    expect(localEntrega('retirada', null, { endereco: 'Rua A, 1' })).toBe('Retirada: Rua A, 1')
    expect(localEntrega('retirada', null, { horario: 'Seg a sex\n8h às 18h' })).toBe('Retirada: aqui na gráfica · Seg a sex · 8h às 18h')
    expect(localEntrega('retirada', null, {})).toBe('Retirada aqui na gráfica.')
    expect(localEntrega(null, null, { endereco: '  ', horario: '' })).toBe('Retirada aqui na gráfica.')
  })
  it('entrega e instalação: endereço do pedido (sem ele, combina com o cliente)', () => {
    expect(localEntrega('entrega', 'Av. Brasil, 500 - Jardim  América', grafica)).toBe('Entrega em: Av. Brasil, 500 - Jardim América')
    expect(localEntrega('entrega', null, grafica)).toBe('Vamos combinar a entrega com você.')
    expect(localEntrega('instalacao', 'Rua B, 10', grafica)).toBe('Instalação em: Rua B, 10')
    expect(localEntrega('instalacao', '', grafica)).toBe('Vamos combinar a instalação com você.')
  })
})

describe('Pix na mensagem', () => {
  it('só quando falta pagar e há chave', () => {
    expect(pixPagamento('300', '100', ' pix@grafica.com ')).toBe('Pix para pagar: *pix@grafica.com*')
    expect(pixPagamento('300', '300', 'pix@grafica.com')).toBe('')
    expect(pixPagamento('300', '0', null)).toBe('')
    expect(pixPagamento('300', '0', '')).toBe('')
  })
})

const pedido = (extra: Partial<PedidoMensagem> = {}): PedidoMensagem => ({
  total: '300',
  valorPago: '0',
  tipoEntrega: 'retirada',
  enderecoEntrega: null,
  itens: [
    { descricao: 'Banner em lona', quantidade: '2', largura: '2', altura: '1', total: '130' },
    { descricao: 'Cartão de visita 4x4', quantidade: '1000', largura: null, altura: null, total: '170' },
  ],
  parcelas: [],
  ...extra,
})
const LINK = 'https://app.grafygo.com.br/pedido/ponto-visual/tok'
const base = { cliente_nome: 'Maria', numero_pedido: 'PED-2026-0017', valor_total: 'R$ 300,00', data_entrega: '20/10/2026', link_acompanhamento: LINK, empresa_nome: 'Ponto Visual' }
const texto = (categoria: keyof typeof TEXTOS_PADRAO_MENSAGEM, p: PedidoMensagem, g = grafica, extra = {}) =>
  preencherMensagem(TEXTOS_PADRAO_MENSAGEM[categoria], { ...base, ...valoresPedidoCompleto(p, g, HOJE, categoria), ...extra })

describe('mensagens do pedido com tudo no corpo', () => {
  it('itens em lista como no orçamento, até 8 linhas', () => {
    const v = valoresPedidoCompleto(pedido(), grafica, HOJE)
    expect(v.itens_pedido).toBe('• 2× Banner em lona 2,0 × 1,0 m — R$ 130,00\n• 1.000× Cartão de visita 4x4 — R$ 170,00')
    const muitos = valoresPedidoCompleto(pedido({ itens: Array.from({ length: 10 }, (_, i) => ({ descricao: `Item ${i + 1}`, quantidade: 1, total: 10 })) }), grafica, HOJE)
    expect(muitos.itens_pedido!.split('\n')).toHaveLength(8)
    expect(muitos.itens_pedido!.split('\n').pop()).toBe('• e mais 3 itens')
  })

  it('pedido confirmado sem nada pago: total, próxima parcela, previsão e retirada; nada de arte', () => {
    const p = pedido({ parcelas: [{ valor: '150', valorPago: '0', vencimento: '2026-10-14', status: 'aberto' }, { valor: '150', valorPago: '0', vencimento: '2026-11-13', status: 'aberto' }] })
    const t = texto('pedido_confirmado', p)
    expect(t).toBe(
      [
        'Olá, Maria!',
        '',
        'Seu pedido *PED-2026-0017* está confirmado ✅',
        '• 2× Banner em lona 2,0 × 1,0 m — R$ 130,00',
        '• 1.000× Cartão de visita 4x4 — R$ 170,00',
        '',
        'Total: *R$ 300,00*',
        'Próxima parcela: *R$ 150,00* em *14/10*',
        'Previsão de entrega: *20/10/2026*',
        'Retirada: Rua das Flores, 123 - Centro - Campinas/SP · Seg a sex, 8h às 18h',
        '',
        'Avisamos por aqui quando estiver pronto.',
        '',
        '— Ponto Visual',
        '',
        'Acompanhe o pedido aqui:',
        LINK,
      ].join('\n'),
    )
    expect(t).not.toMatch(/arte/i)
  })

  it('pedido confirmado com sinal pago: pago e falta; sem parcelas, a linha some', () => {
    const t = texto('pedido_confirmado', pedido({ valorPago: '150', tipoEntrega: 'entrega', enderecoEntrega: 'Av. Brasil, 500' }))
    expect(t).toContain('Total: *R$ 300,00*\nPago: *R$ 150,00* · Falta: *R$ 150,00*\nPrevisão de entrega: *20/10/2026*\nEntrega em: Av. Brasil, 500\n\nAvisamos')
  })

  it('pedido pronto: itens, onde retirar, o que falta e o Pix; link no fim', () => {
    const t = texto('pedido_pronto', pedido({ valorPago: '100' }))
    expect(t).toBe(
      [
        'Olá, Maria!',
        '',
        'Seu pedido *PED-2026-0017* está *pronto* 📦',
        '• 2× Banner em lona 2,0 × 1,0 m — R$ 130,00',
        '• 1.000× Cartão de visita 4x4 — R$ 170,00',
        '',
        'Retirada: Rua das Flores, 123 - Centro - Campinas/SP · Seg a sex, 8h às 18h',
        'Pago: *R$ 100,00* · Falta: *R$ 200,00*',
        'Pix para pagar: *12.345.678/0001-90*',
        '',
        '— Ponto Visual',
        '',
        'Detalhes do pedido:',
        LINK,
      ].join('\n'),
    )
  })

  it('pedido pronto quitado e sem Pix: a linha do Pix some sem sobrar linha em branco', () => {
    const t = texto('pedido_pronto', pedido({ valorPago: '300' }), { ...grafica, chavePix: null })
    expect(t).toContain('Retirada: Rua das Flores, 123 - Centro - Campinas/SP · Seg a sex, 8h às 18h\nPagamento: *quitado* ✅\n\n— Ponto Visual')
    expect(t).not.toContain('Pix')
    expect(t).not.toMatch(/\n{3}/)
  })

  it('saiu para entrega: endereço do pedido, o que falta e o Pix', () => {
    const t = texto('pedido_em_entrega', pedido({ tipoEntrega: 'entrega', enderecoEntrega: 'Av. Brasil, 500 - Jardim América - Campinas/SP' }))
    expect(t).toBe(
      [
        'Olá, Maria!',
        '',
        'Seu pedido *PED-2026-0017* *saiu para entrega* 🚚',
        'Entrega em: Av. Brasil, 500 - Jardim América - Campinas/SP',
        'A pagar: *R$ 300,00*',
        'Pix para pagar: *12.345.678/0001-90*',
        '',
        '— Ponto Visual',
        '',
        'Acompanhe a entrega aqui:',
        LINK,
      ].join('\n'),
    )
  })

  it('pagamento recebido: quanto falta e a próxima parcela; quitado não mostra parcela', () => {
    const parcelas = [{ valor: '150', valorPago: '150', vencimento: '2026-10-14', status: 'pago' }, { valor: '150', valorPago: '0', vencimento: '2026-11-13', status: 'aberto' }]
    const t = texto('pagamento_recebido', pedido({ valorPago: '150', parcelas }), grafica, { valor_pago: 'R$ 150,00' })
    expect(t).toBe(
      [
        'Olá, Maria!',
        '',
        'Recebemos o seu pagamento de *R$ 150,00* do pedido *PED-2026-0017* ✅',
        'Pago: *R$ 150,00* · Falta: *R$ 150,00*',
        'Próxima parcela: *R$ 150,00* em *13/11*',
        '',
        'Obrigado!',
        '— Ponto Visual',
      ].join('\n'),
    )
    const quitado = texto('pagamento_recebido', pedido({ valorPago: '300', parcelas }), grafica, { valor_pago: 'R$ 150,00' })
    expect(quitado).toContain('✅\nPagamento: *quitado* ✅\n\nObrigado!')
  })

  it('acompanhamento: itens, previsão e pagamento antes da assinatura', () => {
    const t = texto('pedido_acompanhamento', pedido({ valorPago: '100' }))
    expect(t).toContain('pelo link abaixo.\n• 2× Banner em lona 2,0 × 1,0 m — R$ 130,00\n• 1.000× Cartão de visita 4x4 — R$ 170,00\n\nPrevisão de entrega: *20/10/2026*\nPago: *R$ 100,00* · Falta: *R$ 200,00*\n\n— Ponto Visual')
    expect(t.endsWith(`Acompanhe aqui:\n${LINK}`)).toBe(true)
  })

  it('templates antigos editados ({{proximo_passo}}, {{forma_entrega}}, {{valor_em_aberto}}) seguem funcionando', () => {
    const antigo = 'Olá, {{cliente_nome}}!\n\n{{proximo_passo}}\n{{forma_entrega}}\nValor em aberto: *{{valor_em_aberto}}*'
    expect(preencherMensagem(antigo, { cliente_nome: 'Maria', proximo_passo: 'Já vamos começar a produção.', forma_entrega: 'Já pode ser retirado aqui na gráfica.', valor_em_aberto: '' })).toBe(
      'Olá, Maria!\n\nJá vamos começar a produção.\nJá pode ser retirado aqui na gráfica.',
    )
  })
})
