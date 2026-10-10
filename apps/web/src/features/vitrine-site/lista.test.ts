import { describe, expect, it } from 'vitest'
import { adicionarItem, atualizarItem, chaveLista, itensParaPedido, lerLista, removerItem, salvarLista, type Armazenamento, type ItemLista } from './lista'

function memoria(): Armazenamento & { dados: Map<string, string> } {
  const dados = new Map<string, string>()
  return {
    dados,
    getItem: (k) => dados.get(k) ?? null,
    setItem: (k, v) => void dados.set(k, v),
    removeItem: (k) => void dados.delete(k),
  }
}

const item = (mudancas: Partial<ItemLista> = {}): ItemLista => ({
  id: 'a',
  produtoSlug: 'banner-em-lona',
  nome: 'Banner em lona',
  capaUrl: null,
  modoCalculo: 'm2',
  preco: { modo: 'fixo', valor: '45', unidade: 'm²' },
  quantidade: 1,
  largura: '1',
  altura: '2',
  larguraMaxima: '3.2',
  alturaMaxima: null,
  acabamentoIds: [],
  acabamentos: [
    { id: '11111111-1111-4111-8111-111111111111', nome: 'Bainha', obrigatorio: true },
    { id: '22222222-2222-4222-8222-222222222222', nome: 'Ilhós', obrigatorio: false },
  ],
  observacao: '',
  ...mudancas,
})

const falha = () => {
  throw new Error('bloqueado')
}

describe('armazenamento da lista', () => {
  it('guarda e lê por slug', () => {
    const m = memoria()
    salvarLista('cupom', [item()], m)
    expect(lerLista('cupom', m)).toHaveLength(1)
    expect(lerLista('outra', m)).toEqual([])
    salvarLista('cupom', [], m)
    expect(m.dados.has(chaveLista('cupom'))).toBe(false)
  })

  it('ignora lixo e itens fora do formato', () => {
    const m = memoria()
    m.setItem(chaveLista('cupom'), '{quebrado')
    expect(lerLista('cupom', m)).toEqual([])
    m.setItem(chaveLista('cupom'), JSON.stringify([{ id: 1 }, item({ quantidade: -3 })]))
    const lidos = lerLista('cupom', m)
    expect(lidos).toHaveLength(1)
    expect(lidos[0]?.quantidade).toBe(1)
  })

  it('não quebra sem armazenamento (navegador bloqueado)', () => {
    const quebrado: Armazenamento = { getItem: falha, setItem: falha, removeItem: falha }
    expect(lerLista('cupom', quebrado)).toEqual([])
    expect(() => salvarLista('cupom', [item()], quebrado)).not.toThrow()
    expect(lerLista('cupom', null)).toEqual([])
  })
})

describe('operações da lista', () => {
  it('mesma escolha soma a quantidade; escolha diferente vira outra linha', () => {
    let itens = adicionarItem([], item({ quantidade: 2 }))
    itens = adicionarItem(itens, item({ id: 'b', quantidade: 3 }))
    expect(itens).toHaveLength(1)
    expect(itens[0]?.quantidade).toBe(5)
    itens = adicionarItem(itens, item({ id: 'c', largura: '2' }))
    expect(itens).toHaveLength(2)
  })

  it('atualiza e remove', () => {
    let itens = [item(), item({ id: 'b', produtoSlug: 'cartao' })]
    itens = atualizarItem(itens, 'b', { quantidade: 500 })
    expect(itens[1]?.quantidade).toBe(500)
    itens = removerItem(itens, 'a')
    expect(itens.map((i) => i.id)).toEqual(['b'])
  })

  it('monta os itens do envio com os acabamentos obrigatórios e sem medidas fora de m²/metro', () => {
    const [m2, milheiro] = itensParaPedido([
      item({ acabamentoIds: ['22222222-2222-4222-8222-222222222222'], observacao: '  com arte  ' }),
      item({ id: 'b', produtoSlug: 'cartao', modoCalculo: 'milheiro', acabamentos: [], observacao: ' ' }),
    ])
    expect(m2).toEqual({
      produtoSlug: 'banner-em-lona',
      quantidade: 1,
      largura: '1',
      altura: '2',
      acabamentoIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
      observacao: 'com arte',
    })
    expect(milheiro).toMatchObject({ largura: null, altura: null, acabamentoIds: [], observacao: null })
  })
})
