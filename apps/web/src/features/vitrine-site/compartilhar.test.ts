import { describe, expect, it } from 'vitest'
import { dadosCompartilharProduto, linkProduto, linkWhatsappLivre, mensagemInteresse, mensagemPedidoEnviado, textoCompartilhar } from './compartilhar'

const link = 'https://grafica.grafygo.com.br/produto/banner-em-lona-440g'

describe('link do produto', () => {
  it('monta o endereço canônico, sem barra dupla', () => {
    expect(linkProduto('https://grafica.grafygo.com.br', 'banner-em-lona-440g')).toBe(link)
    expect(linkProduto('https://grafica.grafygo.com.br/', 'banner-em-lona-440g')).toBe(link)
  })
})

describe('mensagens do WhatsApp', () => {
  it('produto: interesse com o nome e o link', () => {
    expect(mensagemInteresse('Banner em lona 440g ', link)).toBe(`Olá! Tenho interesse no Banner em lona 440g: ${link}`)
  })

  it('pedido enviado: leva o número', () => {
    expect(mensagemPedidoEnviado('SOL-0042')).toBe('Olá! Acabei de enviar pelo site o pedido de orçamento SOL-0042.')
  })
})

describe('compartilhar produto', () => {
  const dados = dadosCompartilharProduto({ nome: 'Cartão de visita 4x4', preco: 'A partir de R$ 89,90 / milheiro', loja: 'Gráfica Horizonte', link })

  it('título com a loja, texto com nome e preço', () => {
    expect(dados).toEqual({
      title: 'Cartão de visita 4x4 · Gráfica Horizonte',
      text: 'Cartão de visita 4x4 — A partir de R$ 89,90 / milheiro\nPeça seu orçamento na Gráfica Horizonte.',
      url: link,
    })
  })

  it('sem loja: só o produto', () => {
    expect(dadosCompartilharProduto({ nome: 'Adesivo', preco: 'Sob consulta', loja: ' ', link })).toEqual({ title: 'Adesivo', text: 'Adesivo — Sob consulta', url: link })
  })

  it('WhatsApp sem número, com texto e link codificados', () => {
    const texto = textoCompartilhar(dados)
    expect(texto.endsWith(`\n${link}`)).toBe(true)
    const wa = linkWhatsappLivre(texto)
    expect(wa.startsWith('https://wa.me/?text=')).toBe(true)
    expect(decodeURIComponent(wa.slice('https://wa.me/?text='.length))).toBe(texto)
    expect(wa).not.toMatch(/[\s&]/)
  })
})
