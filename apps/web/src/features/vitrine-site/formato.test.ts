import { describe, expect, it } from 'vitest'
import { formatarMetros, lerMedida, linkRede, linkWhatsapp, medidaParaCampo, miniatura, paragrafos, partesPreco, resumoEscolha, textoPrazo, textoPreco } from './formato'

describe('preço exibido', () => {
  it('fixo: valor e unidade', () => {
    expect(textoPreco({ modo: 'fixo', valor: '45', unidade: 'm²' })).toBe('R$ 45,00 / m²')
    expect(textoPreco({ modo: 'fixo', valor: '1234.5', unidade: 'milheiro' })).toBe('R$ 1.234,50 / milheiro')
  })

  it('a partir de', () => {
    expect(textoPreco({ modo: 'a_partir_de', valor: '12.50', unidade: 'unidade' })).toBe('A partir de R$ 12,50 / unidade')
    expect(partesPreco({ modo: 'a_partir_de', valor: '12.50', unidade: 'm²' })).toEqual({ prefixo: 'A partir de', valor: 'R$ 12,50', sufixo: '/ m²' })
  })

  it('sob consulta (ou sem valor)', () => {
    expect(textoPreco({ modo: 'sob_consulta', valor: null, unidade: 'm²' })).toBe('Sob consulta')
    expect(textoPreco({ modo: 'fixo', valor: null, unidade: 'm²' })).toBe('Sob consulta')
    expect(textoPreco({ modo: 'fixo', valor: '0', unidade: 'm²' })).toBe('Sob consulta')
  })
})

describe('medidas', () => {
  it('lê metros com vírgula ou ponto', () => {
    expect(lerMedida('1,50')).toBe('1.5')
    expect(lerMedida('2.25')).toBe('2.25')
    expect(lerMedida(' 0,125 m')).toBe('0.125')
    expect(lerMedida('')).toBeNull()
    expect(lerMedida('abc')).toBeUndefined()
    expect(lerMedida('0')).toBeUndefined()
    expect(lerMedida('1,2345')).toBeUndefined()
  })

  it('mostra no campo e no texto', () => {
    expect(medidaParaCampo('1.5')).toBe('1,5')
    expect(medidaParaCampo(null)).toBe('')
    expect(formatarMetros('3.2')).toBe('3,2 m')
  })
})

describe('textos', () => {
  it('prazo', () => {
    expect(textoPrazo(0)).toBeNull()
    expect(textoPrazo(1)).toBe('Pronto em 1 dia')
    expect(textoPrazo(5)).toBe('Pronto em até 5 dias')
  })

  it('parágrafos separados por linha em branco', () => {
    expect(paragrafos('Primeiro\ncontinua\n\n\nSegundo\r\n\r\nTerceiro')).toEqual(['Primeiro\ncontinua', 'Segundo', 'Terceiro'])
    expect(paragrafos(null)).toEqual([])
  })
})

describe('links', () => {
  it('WhatsApp com DDI do Brasil e mensagem', () => {
    expect(linkWhatsapp('(11) 98765-4321', 'Olá! Tudo bem?')).toBe('https://wa.me/5511987654321?text=Ol%C3%A1!%20Tudo%20bem%3F')
    expect(linkWhatsapp('5511987654321')).toBe('https://wa.me/5511987654321')
    expect(linkWhatsapp('123')).toBeNull()
    expect(linkWhatsapp(null)).toBeNull()
  })

  it('redes sociais aceitam @usuario ou endereço', () => {
    expect(linkRede('instagram', '@grafica.cupom')).toBe('https://instagram.com/grafica.cupom')
    expect(linkRede('tiktok', 'cupom')).toBe('https://tiktok.com/@cupom')
    expect(linkRede('facebook', 'https://facebook.com/cupom')).toBe('https://facebook.com/cupom')
    expect(linkRede('youtube', 'youtube.com/@cupom')).toBe('https://youtube.com/@cupom')
    expect(linkRede('instagram', '  ')).toBeNull()
  })
})

describe('resumo das escolhas', () => {
  it('quantidade, medidas e acabamentos', () => {
    expect(resumoEscolha({ modoCalculo: 'm2', quantidade: 2, largura: '1.5', altura: '0.8', acabamentos: ['Ilhós', 'Bainha'] })).toBe('2 un. · 1,5 × 0,8 m · Ilhós, Bainha')
    expect(resumoEscolha({ modoCalculo: 'metro_linear', quantidade: 1, largura: '3', altura: null })).toBe('1 un. · 3 m')
    expect(resumoEscolha({ modoCalculo: 'milheiro', quantidade: 2000, largura: '0.09', altura: '0.05' })).toBe('2.000 un.')
    expect(resumoEscolha({ modoCalculo: 'hora', quantidade: 3 })).toBe('3 h')
  })
})

describe('miniatura', () => {
  it('troca a imagem grande pela de 480 px', () => {
    expect(miniatura('/api/v1/publico/x/vitrine/imagens/abc?w=1200')).toBe('/api/v1/publico/x/vitrine/imagens/abc?w=480')
    expect(miniatura('/outra.png')).toBe('/outra.png')
  })
})
