import { describe, expect, it } from 'vitest'
import { dominioVitrineSchema, normalizarDominio, pedidoVitrineSchema, subdominioReservado } from '@onprint/shared'
import { gerarSlug } from '../src/plataforma/provisionar'
import {
  dominioReservado,
  dominioVitrine,
  hostDoSubdominio,
  linkWhatsappLoja,
  montarDescricaoSolicitacao,
  normalizarSlug,
  precoExibido,
  slugDoDominio,
  slugLivre,
  textoMedidas,
  urlDaVitrine,
  urlPublicaVitrine,
  variantesDominio,
} from '../src/modules/vitrine/regras'

describe('vitrine: slug do produto', () => {
  it('normaliza sem acento, minúsculo e com hífen', () => {
    expect(normalizarSlug('Banner em Lona 440 g!')).toBe('banner-em-lona-440-g')
    expect(normalizarSlug('  Cartão de Visita 4×4 — Couché  ')).toBe('cartao-de-visita-4-4-couche')
    expect(normalizarSlug('***')).toBe('')
    expect(normalizarSlug('a'.repeat(100)).length).toBe(80)
  })
  it('gera o primeiro livre com -2, -3…', () => {
    expect(slugLivre('banner', new Set())).toBe('banner')
    expect(slugLivre('banner', new Set(['banner']))).toBe('banner-2')
    expect(slugLivre('banner', new Set(['banner', 'banner-2', 'banner-3']))).toBe('banner-4')
    expect(slugLivre('', new Set())).toBe('produto')
  })
  it('sufixo cabe no limite de 80 letras', () => {
    const longo = 'a'.repeat(80)
    const s = slugLivre(longo, new Set([longo]))
    expect(s.length).toBeLessThanOrEqual(80)
    expect(s.endsWith('-2')).toBe(true)
  })
})

describe('vitrine: subdomínios reservados', () => {
  it('reconhece os reservados', () => {
    for (const r of ['www', 'app', 'api', 'admin', 'plataforma', 'painel', 'mail', 'cdn', 'assets', 'API']) expect(subdominioReservado(r)).toBe(true)
    expect(subdominioReservado('grafica-x')).toBe(false)
  })
  it('extrai o slug do domínio pedido pelo Caddy', () => {
    expect(slugDoDominio('grafica-x.grafygo.com.br', 'grafygo.com.br')).toBe('grafica-x')
    expect(slugDoDominio('GRAFICA-X.grafygo.com.br.', 'grafygo.com.br')).toBe('grafica-x')
    expect(slugDoDominio('grafica-x.localhost:5173', 'localhost')).toBe('grafica-x')
    expect(slugDoDominio('www.grafygo.com.br', 'grafygo.com.br')).toBeNull()
    expect(slugDoDominio('app.grafygo.com.br', 'grafygo.com.br')).toBeNull()
    expect(slugDoDominio('a.b.grafygo.com.br', 'grafygo.com.br')).toBeNull()
    expect(slugDoDominio('grafygo.com.br', 'grafygo.com.br')).toBeNull()
    expect(slugDoDominio('grafica-x.outro.com', 'grafygo.com.br')).toBeNull()
    expect(slugDoDominio('-x.grafygo.com.br', 'grafygo.com.br')).toBeNull()
  })
  it('slug de empresa gerado continua válido como subdomínio', () => {
    expect(slugDoDominio(`${gerarSlug('Gráfica São João Ltda.')}.grafygo.com.br`, 'grafygo.com.br')).toBe('grafica-sao-joao-ltda')
  })
})

describe('vitrine: endereço público', () => {
  const dev = { DOMINIO_VITRINE: '', NODE_ENV: 'development', APP_URL: 'http://localhost:5173' }
  it('desenvolvimento sem domínio: {slug}.localhost:5173', () => {
    expect(urlPublicaVitrine('principal', dev)).toBe('http://principal.localhost:5173')
    expect(dominioVitrine(dev)).toBe('localhost')
  })
  it('com DOMINIO_VITRINE: https://{slug}.{dominio}', () => {
    expect(urlPublicaVitrine('cupom', { ...dev, DOMINIO_VITRINE: 'grafygo.com.br', NODE_ENV: 'production' })).toBe('https://cupom.grafygo.com.br')
  })
  it('produção sem domínio usa o do APP_URL', () => {
    expect(urlPublicaVitrine('cupom', { DOMINIO_VITRINE: '', NODE_ENV: 'production', APP_URL: 'https://app.grafygo.com.br' })).toBe('https://cupom.grafygo.com.br')
  })
})

describe('vitrine: preço exibido', () => {
  it('fixo e "a partir de" mostram o preço de venda com a unidade', () => {
    expect(precoExibido({ vitrineModoPreco: 'fixo', precoVenda: '45', modoCalculo: 'm2' })).toEqual({ modo: 'fixo', valor: '45.00', unidade: 'm²' })
    expect(precoExibido({ vitrineModoPreco: 'a_partir_de', precoVenda: '120.5', modoCalculo: 'milheiro' })).toEqual({ modo: 'a_partir_de', valor: '120.50', unidade: 'milheiro' })
  })
  it('sob consulta não mostra valor', () => {
    expect(precoExibido({ vitrineModoPreco: 'sob_consulta', precoVenda: '99', modoCalculo: 'unidade' })).toEqual({ modo: 'sob_consulta', valor: null, unidade: 'unidade' })
  })
  it('unidades por modo de cálculo', () => {
    const unidade = (modoCalculo: 'm2' | 'metro_linear' | 'milheiro' | 'hora' | 'unidade') => precoExibido({ vitrineModoPreco: 'fixo', precoVenda: 1, modoCalculo }).unidade
    expect([unidade('m2'), unidade('metro_linear'), unidade('milheiro'), unidade('hora'), unidade('unidade')]).toEqual(['m²', 'metro', 'milheiro', 'hora', 'unidade'])
  })
  it('modo desconhecido vira sob consulta', () => {
    expect(precoExibido({ vitrineModoPreco: 'qualquer', precoVenda: '10', modoCalculo: 'm2' }).valor).toBeNull()
  })
})

describe('vitrine: descrição da solicitação', () => {
  it('um item por linha com medidas, acabamentos, observação e a mensagem no fim', () => {
    const texto = montarDescricaoSolicitacao(
      [
        { descricao: 'Banner em lona', quantidade: 2, largura: '1.500', altura: '0.8', acabamentos: [{ nome: 'Ilhós' }, { nome: 'Bastão' }], observacao: 'Arte própria' },
        { descricao: 'Cartão de visita', quantidade: 1000, largura: null, altura: null, acabamentos: [], observacao: null },
      ],
      '  Preciso para sexta  ',
    )
    expect(texto).toBe(
      [
        'Lista de orçamento enviada pelo site (2 itens):',
        '1. Banner em lona · Qtd.: 2 · 1,5 × 0,8 m · Acabamentos: Ilhós, Bastão · Obs.: Arte própria',
        '2. Cartão de visita · Qtd.: 1000',
        '',
        'Mensagem: Preciso para sexta',
      ].join('\n'),
    )
  })
  it('sem mensagem e com só uma medida (metro linear)', () => {
    expect(montarDescricaoSolicitacao([{ descricao: 'Faixa', quantidade: 1, largura: '3', altura: null, acabamentos: [], observacao: null }], null)).toBe(
      'Lista de orçamento enviada pelo site (1 item):\n1. Faixa · Qtd.: 1 · 3 m',
    )
  })
})

describe('vitrine: lista de orçamento (contrato)', () => {
  const item = { produtoSlug: 'banner-em-lona', quantidade: '2', largura: '1,50', altura: '0,8' }
  it('normaliza WhatsApp e medidas', () => {
    const r = pedidoVitrineSchema.parse({ nome: 'Ana', whatsapp: '(11) 98888-7777', email: '', itens: [item] })
    expect(r.whatsapp).toBe('11988887777')
    expect(r.email).toBeNull()
    expect(r.itens[0]).toMatchObject({ quantidade: 2, largura: '1.50', altura: '0.8', acabamentoIds: [] })
  })
  it('exige WhatsApp e ao menos um item', () => {
    expect(pedidoVitrineSchema.safeParse({ nome: 'Ana', whatsapp: '', itens: [item] }).success).toBe(false)
    expect(pedidoVitrineSchema.safeParse({ nome: 'Ana', whatsapp: '11988887777', itens: [] }).success).toBe(false)
  })
})

describe('vitrine: domínio próprio', () => {
  const prod = { DOMINIO_VITRINE: 'grafygo.com.br', NODE_ENV: 'production', APP_URL: 'https://app.grafygo.com.br' }

  it('normaliza o que a pessoa cola (protocolo, caminho, maiúsculas, acento em punycode)', () => {
    expect(normalizarDominio('  HTTPS://WWW.Grafica.com.br/produtos?x=1 ')).toBe('www.grafica.com.br')
    expect(normalizarDominio('grafica.com.br.')).toBe('grafica.com.br')
    expect(normalizarDominio('gráfica.com.br')).toBe('xn--grfica-qta.com.br')
    expect(normalizarDominio('   ')).toBe('')
  })

  it('aceita domínio válido; vazio tira; recusa o que não é domínio', () => {
    expect(dominioVitrineSchema.parse({ dominio: 'https://www.grafica.com.br/' }).dominio).toBe('www.grafica.com.br')
    expect(dominioVitrineSchema.parse({ dominio: '' }).dominio).toBeNull()
    expect(dominioVitrineSchema.parse({ dominio: null }).dominio).toBeNull()
    for (const ruim of ['grafica', 'grafica.', 'gra fica.com.br', '-grafica.com.br', '192.168.0.1', 'grafica.c']) {
      expect(dominioVitrineSchema.safeParse({ dominio: ruim }).success, ruim).toBe(false)
    }
  })

  it('www e sem www são a mesma vitrine', () => {
    expect(variantesDominio('WWW.Grafica.com.br:443')).toEqual(['www.grafica.com.br', 'grafica.com.br'])
    expect(variantesDominio('grafica.com.br')).toEqual(['grafica.com.br', 'www.grafica.com.br'])
    expect(variantesDominio('')).toEqual([])
  })

  it('não deixa usar o domínio da GrafyGo, os subdomínios dela nem o sistema', () => {
    expect(dominioReservado('grafygo.com.br', prod)).toBe(true)
    expect(dominioReservado('outra-grafica.grafygo.com.br', prod)).toBe(true)
    expect(dominioReservado('app.grafygo.com.br', prod)).toBe(true)
    expect(dominioReservado('www.grafica.com.br', prod)).toBe(false)
    expect(dominioReservado('teste.localhost', { ...prod, DOMINIO_VITRINE: '', NODE_ENV: 'development', APP_URL: 'http://localhost:5173' })).toBe(true)
  })

  it('links usam o domínio próprio só depois de verificado', () => {
    expect(urlDaVitrine({ slug: 'grafica-x', dominioVitrine: 'www.grafica.com.br' }, prod)).toBe('https://www.grafica.com.br')
    expect(urlDaVitrine({ slug: 'grafica-x', dominioVitrine: null }, prod)).toBe('https://grafica-x.grafygo.com.br')
    expect(urlDaVitrine({ slug: 'grafica-x' }, prod)).toBe('https://grafica-x.grafygo.com.br')
    expect(hostDoSubdominio('grafica-x', prod)).toBe('grafica-x.grafygo.com.br')
  })
})

describe('vitrine: e-mail de confirmação do pedido', () => {
  it('medidas em metros com vírgula; sem medida, nada', () => {
    expect(textoMedidas('2.000', '1.500')).toBe('2 × 1,5 m')
    expect(textoMedidas('3', null)).toBe('3 m')
    expect(textoMedidas(null, null)).toBeNull()
  })

  it('WhatsApp da gráfica com o código do país e a mensagem pronta', () => {
    expect(linkWhatsappLoja('(11) 98888-7777', 'Olá! Pedido SOL-1')).toBe('https://wa.me/5511988887777?text=Ol%C3%A1!%20Pedido%20SOL-1')
    expect(linkWhatsappLoja('5511988887777', 'x')).toBe('https://wa.me/5511988887777?text=x')
    expect(linkWhatsappLoja('123', 'x')).toBeNull()
  })
})
