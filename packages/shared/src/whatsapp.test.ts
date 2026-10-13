import { describe, expect, it } from 'vitest'
import { inserirAntesDoFim, linhaItemMensagem, listaItensMensagem, textoPrazoDias, valorEmAberto } from './mensagens'
import {
  TEXTOS_PADRAO_MENSAGEM,
  TEXTOS_PADRAO_WHATSAPP,
  envioWhatsappSchema,
  formatarNumeroWhatsapp,
  linkWaMe,
  normalizarNumeroWhatsapp,
  preencherMensagem,
  whatsappConfigSchema,
} from './whatsapp'

describe('normalizarNumeroWhatsapp', () => {
  it('celular com máscara, com +55 e com 0 do DDD', () => {
    expect(normalizarNumeroWhatsapp('(11) 98888-7777')).toBe('5511988887777')
    expect(normalizarNumeroWhatsapp('+55 11 98888-7777')).toBe('5511988887777')
    expect(normalizarNumeroWhatsapp('5511988887777')).toBe('5511988887777')
    expect(normalizarNumeroWhatsapp('011 98888-7777')).toBe('5511988887777')
  })
  it('fixo (WhatsApp Business) com 8 dígitos', () => {
    expect(normalizarNumeroWhatsapp('(48) 3333-4444')).toBe('554833334444')
    expect(normalizarNumeroWhatsapp('554833334444')).toBe('554833334444')
  })
  it('recusa o que não é telefone brasileiro válido', () => {
    expect(normalizarNumeroWhatsapp(null)).toBeNull()
    expect(normalizarNumeroWhatsapp('')).toBeNull()
    expect(normalizarNumeroWhatsapp('98888-7777')).toBeNull() // sem DDD
    expect(normalizarNumeroWhatsapp('(10) 98888-7777')).toBeNull() // DDD inválido
    expect(normalizarNumeroWhatsapp('(11) 88888-7777')).toBeNull() // 9 dígitos sem o 9 na frente
    expect(normalizarNumeroWhatsapp('(11) 8888-7777')).toBeNull() // celular antigo, sem o 9
    expect(normalizarNumeroWhatsapp('1234567890123456')).toBeNull()
  })
})

const LINK = 'https://app.x/pedido/grafica/tok'

describe('preencherMensagem', () => {
  it('saudação, blocos separados, negrito e link sozinho na última linha', () => {
    const texto = preencherMensagem(TEXTOS_PADRAO_WHATSAPP.pedido_em_entrega, {
      cliente_nome: 'Ana',
      numero_pedido: 'PED-2026-0001',
      link_acompanhamento: LINK,
      empresa_nome: 'Gráfica Boa',
    })
    expect(texto).toBe(`Olá, Ana!\n\nSeu pedido *PED-2026-0001* *saiu para entrega* 🚚\nLogo chega até você.\n\n— Gráfica Boa\n\nAcompanhe a entrega aqui:\n${LINK}`)
  })
  it('sem link e sem a gráfica: o rótulo, o link e a assinatura saem (sem sobrar linha em branco)', () => {
    const texto = preencherMensagem(TEXTOS_PADRAO_WHATSAPP.pedido_em_entrega, { cliente_nome: 'Ana', numero_pedido: 'P1' })
    expect(texto).toBe('Olá, Ana!\n\nSeu pedido *P1* *saiu para entrega* 🚚\nLogo chega até você.')
  })
  it('linha com o negrito vazio ou terminando em ":" some; sem nome fica "Olá!"', () => {
    const texto = preencherMensagem(TEXTOS_PADRAO_MENSAGEM.pedido_confirmado, { numero_pedido: 'PED-1', link_acompanhamento: LINK })
    expect(texto.startsWith('Olá!\n\n')).toBe(true)
    expect(texto).not.toContain('orçamento')
    expect(texto).not.toContain('Previsão')
    expect(texto).toContain('Seu pedido *PED-1* está confirmado ✅')
    expect(texto.endsWith(`Acompanhe o pedido aqui:\n${LINK}`)).toBe(true)
  })
  it('variável vazia no meio da frase não apaga a linha', () => {
    expect(preencherMensagem('Olá, {{cliente_nome}}! Pedido {{numero_pedido}} ok.', { cliente_nome: 'Ana' })).toBe('Olá, Ana! Pedido  ok.')
  })
  it('orçamento: itens em lista, total em negrito e o link de aprovação no fim', () => {
    const itens = listaItensMensagem([
      { descricao: 'Banner em lona', quantidade: '2', largura: '2', altura: '1', total: '130' },
      { descricao: 'Cartão de visita', quantidade: '1000', total: '89.9' },
    ])
    const texto = preencherMensagem(TEXTOS_PADRAO_MENSAGEM.orcamento_enviado, {
      cliente_nome: 'Maria',
      numero_orcamento: 'ORC-2026-0042',
      itens_orcamento: itens,
      valor_total: 'R$ 219,90',
      prazo_producao: textoPrazoDias(5),
      validade: '20/10/2026',
      link_aprovacao: 'https://app.x/aprovar/g/t',
      empresa_nome: 'Ponto Visual',
    })
    expect(texto).toBe(
      [
        'Olá, Maria!',
        '',
        'Segue o seu orçamento *ORC-2026-0042*:',
        '• 2× Banner em lona 2,0 × 1,0 m — R$ 130,00',
        '• 1.000× Cartão de visita — R$ 89,90',
        '',
        'Total: *R$ 219,90*',
        'Prazo de produção: *5 dias úteis*',
        'Válido até *20/10/2026*',
        '',
        '— Ponto Visual',
        '',
        'Veja os detalhes e aprove aqui:',
        'https://app.x/aprovar/g/t',
      ].join('\n'),
    )
  })
  it('todo texto padrão começa pela saudação, assina e tem no máximo um emoji e um link (no fim)', () => {
    for (const t of Object.values(TEXTOS_PADRAO_MENSAGEM)) {
      expect(t.startsWith('Olá, {{cliente_nome}}!\n\n')).toBe(true)
      expect(t).toContain('— {{empresa_nome}}')
      expect((t.match(/\p{Extended_Pictographic}/gu) ?? []).length).toBeLessThanOrEqual(1)
      const links = t.match(/\{\{link_[a-z_]+\}\}/g) ?? []
      expect(links.length).toBeLessThanOrEqual(1)
      if (links.length) expect(t.endsWith(`:\n${links[0]}`)).toBe(true)
    }
  })
})

describe('peças das mensagens', () => {
  it('linha do item com quantidade, medida e valor', () => {
    expect(linhaItemMensagem({ descricao: ' Adesivo ', quantidade: '3', largura: '0.5', altura: '0.25', total: '45' })).toBe('3× Adesivo 0,5 × 0,25 m — R$ 45,00')
    expect(linhaItemMensagem({ descricao: 'Arte', quantidade: 1, largura: null, altura: null, total: 0 })).toBe('1× Arte — R$ 0,00')
  })
  it('lista longa resume o resto', () => {
    const itens = Array.from({ length: 10 }, (_, i) => ({ descricao: `Item ${i + 1}`, quantidade: 1, total: 1 }))
    const lista = listaItensMensagem(itens, 4).split('\n')
    expect(lista).toHaveLength(4)
    expect(lista[3]).toBe('• e mais 7 itens')
  })
  it('prazo e valor em aberto', () => {
    expect([0, 1, 7].map((d) => textoPrazoDias(d))).toEqual(['', '1 dia útil', '7 dias úteis'])
    expect(valorEmAberto('300', '150')).toBe('R$ 150,00')
    expect(valorEmAberto('300', '300')).toBe('')
  })
  it('bloco extra entra antes da assinatura (o link continua no fim)', () => {
    const base = 'Olá!\n\nSegue.\n\n— Gráfica\n\nVeja aqui:\nhttps://x.y/z'
    expect(inserirAntesDoFim(base, 'O PDF vai logo abaixo.')).toBe('Olá!\n\nSegue.\n\nO PDF vai logo abaixo.\n\n— Gráfica\n\nVeja aqui:\nhttps://x.y/z')
    expect(inserirAntesDoFim('Olá!\n\nVeja aqui:\nhttps://x.y/z', 'Extra.')).toBe('Olá!\n\nExtra.\n\nVeja aqui:\nhttps://x.y/z')
    expect(inserirAntesDoFim('Olá!', 'Extra.')).toBe('Olá!\n\nExtra.')
  })
})

describe('envio pela equipe', () => {
  const base = { tipo: 'catalogo', telefone: '(11) 98888-7777', texto: 'Olá!' } as const
  const id = '7c1b0c5e-6d43-4c1e-9b0b-1f6f2d3a4b5c'
  it('número com DDD e texto obrigatórios', () => {
    expect(envioWhatsappSchema.safeParse(base).success).toBe(true)
    expect(envioWhatsappSchema.safeParse({ ...base, telefone: '98888-7777' }).success).toBe(false)
    expect(envioWhatsappSchema.safeParse({ ...base, texto: '  ' }).success).toBe(false)
    expect(envioWhatsappSchema.safeParse({ ...base, tipo: 'qualquer' }).success).toBe(false)
  })
  it('orçamento, pedido e arte pedem o vínculo', () => {
    expect(envioWhatsappSchema.safeParse({ ...base, tipo: 'orcamento_enviado' }).success).toBe(false)
    expect(envioWhatsappSchema.safeParse({ ...base, tipo: 'orcamento_enviado', orcamentoId: id }).success).toBe(true)
    expect(envioWhatsappSchema.safeParse({ ...base, tipo: 'pedido_pronto' }).success).toBe(false)
    expect(envioWhatsappSchema.safeParse({ ...base, tipo: 'arte_aprovacao', pedidoId: id }).success).toBe(false)
    expect(envioWhatsappSchema.safeParse({ ...base, tipo: 'arte_aprovacao', pedidoId: id, arteId: id }).success).toBe(true)
  })
  it('número para mostrar', () => {
    expect(formatarNumeroWhatsapp('5511988887777')).toBe('(11) 98888-7777')
    expect(formatarNumeroWhatsapp('554833334444')).toBe('(48) 3333-4444')
  })
})

describe('configuração do WhatsApp', () => {
  it('horário de início antes do fim', () => {
    expect(whatsappConfigSchema.safeParse({ eventos: [], horarioInicio: '08:00', horarioFim: '20:00', pausado: false }).success).toBe(true)
    expect(whatsappConfigSchema.safeParse({ eventos: [], horarioInicio: '20:00', horarioFim: '08:00', pausado: false }).success).toBe(false)
    expect(whatsappConfigSchema.safeParse({ eventos: ['x'], horarioInicio: '08:00', horarioFim: '20:00', pausado: false }).success).toBe(false)
  })
  it('link wa.me com o texto codificado', () => {
    expect(linkWaMe('5511988887777', 'Olá & até')).toBe('https://wa.me/5511988887777?text=Ol%C3%A1%20%26%20at%C3%A9')
  })
})
