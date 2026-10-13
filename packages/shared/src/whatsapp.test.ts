import { describe, expect, it } from 'vitest'
import { TEXTOS_PADRAO_WHATSAPP, linkWaMe, normalizarNumeroWhatsapp, preencherMensagem, whatsappConfigSchema } from './whatsapp'

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

describe('preencherMensagem', () => {
  it('preenche as variáveis e mantém as quebras de linha', () => {
    const texto = preencherMensagem(TEXTOS_PADRAO_WHATSAPP.pedido_em_entrega, {
      cliente_nome: 'Ana',
      numero_pedido: 'PED-2026-0001',
      link_acompanhamento: 'https://app.x/pedido/grafica/tok',
      empresa_nome: 'Gráfica Boa',
    })
    expect(texto).toBe('Olá, Ana! Seu pedido PED-2026-0001 saiu para entrega.\nAcompanhe: https://app.x/pedido/grafica/tok\nGráfica Boa')
  })
  it('tira a linha do link vazio e a assinatura sem nome', () => {
    const texto = preencherMensagem(TEXTOS_PADRAO_WHATSAPP.pedido_em_entrega, { cliente_nome: 'Ana', numero_pedido: 'P1' })
    expect(texto).toBe('Olá, Ana! Seu pedido P1 saiu para entrega.')
  })
  it('variável vazia no meio da frase não apaga a linha', () => {
    expect(preencherMensagem('Olá, {{cliente_nome}}! Pedido {{numero_pedido}} ok.', { cliente_nome: 'Ana' })).toBe('Olá, Ana! Pedido  ok.')
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
