import { describe, expect, it } from 'vitest'
import { linhaObsRecusados, textoMensagemOrcamento, TEXTOS_PADRAO_MENSAGEM } from '@onprint/shared'
import {
  foraDaLeitura,
  interpretarRespostaFora,
  juntarFora,
  lerForaDoCatalogo,
  linhaForaNoTopo,
  nomeDoFora,
  pendentesFora,
  textoAvisoOrcamento,
  textoConfirmarFora,
  textoNadaNoCatalogo,
  type ItemFora,
} from '../src/modules/whatsapp/copiloto'

const item = (descricao: string, quantidade: string | null = '50', situacao: ItemFora['situacao'] = 'pendente'): ItemFora => ({ chave: descricao, descricao, quantidade, situacao })

describe('Item fora do catálogo: o que ficou de fora', () => {
  it('a leitura sem produto vira item de fora (nome como o cliente pediu, sem a quantidade e o "quanto fica")', () => {
    const fora = foraDaLeitura({
      itens: [
        { produto: { id: 'p1' }, descricao: '2 banners 2x1', quantidade: '2' },
        { produto: null, descricao: 'quanto fica 50 chaveiros personalizados?', quantidade: '50' },
      ],
    })
    expect(fora).toHaveLength(1)
    expect(fora[0]).toMatchObject({ descricao: 'chaveiros personalizados', quantidade: '50', situacao: 'pendente' })
    expect(nomeDoFora('e 30 bonés bordados')).toBe('bonés bordados')
    expect(nomeDoFora('Chaveiro personalizado')).toBe('Chaveiro personalizado')
  })
  it('aviso: "⚠️ Ficou de fora" no topo, antes de tudo', () => {
    const fora = [item('chaveiro personalizado')]
    expect(linhaForaNoTopo(fora)).toBe('⚠️ Ficou de fora: 50× chaveiro personalizado (não está no catálogo)')
    expect(linhaForaNoTopo([item('chaveiro', '50', 'recusado')])).toBeNull()
    const aviso = textoAvisoOrcamento(
      { numero: 'ORC-1', cliente: 'Ana', clienteNovo: false, itens: [{ descricao: 'Banner', quantidade: '2', total: '320' }], total: '320', conferir: [], link: 'http://x', foraNoTopo: linhaForaNoTopo(fora) },
      'reacao',
    )
    expect(aviso.split('\n')[0]).toBe('⚠️ Ficou de fora: 50× chaveiro personalizado (não está no catálogo)')
  })
  it('o "ok" com item de fora pede confirmação; nada no catálogo pede o preço', () => {
    expect(textoConfirmarFora('ORC-2026-0140', [item('chaveiro personalizado')])).toBe(
      'O ORC-2026-0140 vai sem 50× chaveiro personalizado. Responda *ok* de novo a esta mensagem para enviar assim, diga o preço para eu incluir (ex.: "chaveiro R$ 4 a unidade") ou *não tem*.',
    )
    expect(textoNadaNoCatalogo([item('chaveiro personalizado')])).toBe(
      'Não tenho no catálogo: 50× chaveiro personalizado. Me diga o preço (ex.: "chaveiro R$ 4 a unidade") que eu cadastro e monto o orçamento, ou *não tem*.',
    )
  })
  it('guardado no banco: lê só o que tem formato; 📝 de novo não repete o mesmo item', () => {
    expect(lerForaDoCatalogo(null)).toEqual([])
    expect(lerForaDoCatalogo([{ x: 1 }, item('caneca')])).toEqual([item('caneca')])
    const juntos = juntarFora([item('chaveiro')], [item('Chaveiro'), item('boné', '10')])
    expect(juntos.map((i) => i.descricao)).toEqual(['chaveiro', 'boné'])
    expect(pendentesFora([item('a'), item('b', '1', 'incluido')]).map((i) => i.descricao)).toEqual(['a'])
  })
})

describe('Item fora do catálogo: a resposta do dono', () => {
  const um = [item('chaveiro personalizado')]
  const dois = [item('chaveiro personalizado'), item('bonés bordados', '30')]
  it('preço: "chaveiro acrílico R$ 4 a unidade", "4 reais cada", "R$ 0,50 un"', () => {
    expect(interpretarRespostaFora('chaveiro acrílico R$ 4 a unidade', um)).toEqual({ tipo: 'preco', item: 0 })
    expect(interpretarRespostaFora('4 reais cada', um)).toEqual({ tipo: 'preco', item: 0 })
    expect(interpretarRespostaFora('R$ 0,50 un', um)).toEqual({ tipo: 'preco', item: 0 })
  })
  it('com mais de um item: o nome diz qual; sem nome, ambíguo (pergunta)', () => {
    expect(interpretarRespostaFora('chaveiro R$ 4 un', dois)).toEqual({ tipo: 'preco', item: 0 })
    expect(interpretarRespostaFora('boné R$ 25 a unidade', dois)).toEqual({ tipo: 'preco', item: 1 })
    expect(interpretarRespostaFora('R$ 4 a unidade', dois)).toEqual({ tipo: 'preco', item: null })
  })
  it('"não tem", "não faço", "manda sem" (todos) e "tira o chaveiro" (só ele)', () => {
    for (const t of ['não tem', 'Não faço', 'manda sem', 'não fazemos isso', 'pode ir sem']) expect(interpretarRespostaFora(t, dois)).toEqual({ tipo: 'recusar', itens: [0, 1] })
    expect(interpretarRespostaFora('não tem boné', dois)).toEqual({ tipo: 'recusar', itens: [1] })
    expect(interpretarRespostaFora('tira o chaveiro', dois)).toEqual({ tipo: 'recusar', itens: [0] })
  })
  it('o resto não é sobre os itens de fora (vai para o ajuste ou o "ok")', () => {
    for (const t of ['ok', 'tira o 2', '10% de desconto', 'desconto de 50 reais', 'faz por 500', 'quem está devendo?']) expect(interpretarRespostaFora(t, um)).toBeNull()
    expect(interpretarRespostaFora('chaveiro R$ 4', [])).toBeNull()
  })
})

describe('A linha "Obs." ao cliente (itens recusados)', () => {
  it('um, dois ou nenhum', () => {
    expect(linhaObsRecusados(['chaveiro personalizado'])).toBe('Obs.: chaveiro personalizado não fazemos no momento.')
    expect(linhaObsRecusados(['chaveiro', 'caneca', 'boné'])).toBe('Obs.: chaveiro, caneca e boné não fazemos no momento.')
    expect(linhaObsRecusados([])).toBeNull()
  })
  it('no texto do orçamento, antes da assinatura (e o aviso do PDF depois dela)', () => {
    const o = {
      numero: 'ORC-1',
      cliente: { nome: 'Ana Souza' },
      itens: [{ descricao: 'Banner', quantidade: '2', total: '320' }],
      total: '320',
      sinalPercentual: '50',
      parcelas: 1,
      intervaloDias: 30,
      prazoDias: 2,
      validade: '2026-11-05',
      regras: {},
    }
    const texto = textoMensagemOrcamento(o, TEXTOS_PADRAO_MENSAGEM.orcamento_enviado, { empresa: 'Gráfica', linkAprovacao: 'http://x', comPdf: true, recusados: ['chaveiro personalizado'] })
    const blocos = texto.split('\n\n')
    const obs = blocos.findIndex((b) => b === 'Obs.: chaveiro personalizado não fazemos no momento.')
    const assinatura = blocos.findIndex((b) => b.startsWith('— '))
    expect(obs).toBeGreaterThan(0)
    expect(obs).toBeLessThan(assinatura)
    expect(textoMensagemOrcamento(o, TEXTOS_PADRAO_MENSAGEM.orcamento_enviado, { empresa: 'Gráfica', linkAprovacao: 'http://x' })).not.toContain('Obs.:')
  })
})
