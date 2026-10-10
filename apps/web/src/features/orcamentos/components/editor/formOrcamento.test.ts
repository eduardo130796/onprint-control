import { describe, expect, it } from 'vitest'
import type { ProdutoCatalogo, SolicitacaoItem } from '@onprint/shared'
import { itensDaSolicitacao } from './formOrcamento'

const banner = {
  id: 'p-banner',
  codigo: 'PRD-0001',
  nome: 'Banner em lona',
  descricao: null,
  modoCalculo: 'm2',
  precoVenda: '45.00',
  precoMinimo: null,
  larguraPadrao: '1.000',
  alturaPadrao: '1.000',
  larguraMaxima: '5.000',
  alturaMaxima: '3.000',
  prazoProducaoDias: 3,
  acabamentos: [
    { acabamentoId: 'a-ilhos', obrigatorio: true, padrao: true },
    { acabamentoId: 'a-bastao', obrigatorio: false, padrao: false },
  ],
} as unknown as ProdutoCatalogo

const item = (p: Partial<SolicitacaoItem>): SolicitacaoItem => ({
  id: 'i',
  produtoId: 'p-banner',
  descricao: 'Banner em lona',
  quantidade: 1,
  largura: null,
  altura: null,
  acabamentos: [],
  observacao: null,
  ...p,
})

describe('itens do pedido do site no orçamento', () => {
  it('traz produto, quantidade, medidas, acabamentos e observação', () => {
    const { itens, ignorados } = itensDaSolicitacao(
      [item({ quantidade: 3, largura: '2.000', altura: '1.500', acabamentos: [{ id: 'a-bastao', nome: 'Bastão' }], observacao: 'Arte pronta' })],
      [banner],
    )
    expect(ignorados).toBe(0)
    expect(itens[0]).toMatchObject({
      produto: { id: 'p-banner', rotulo: 'Banner em lona', detalhe: 'PRD-0001' },
      quantidade: '3',
      largura: '2',
      altura: '1,5',
      observacao: 'Arte pronta',
      precoUnitario: '',
    })
    // Obrigatório entra sempre; o escolhido também
    expect(itens[0]?.acabamentoIds.sort()).toEqual(['a-bastao', 'a-ilhos'])
  })

  it('sem medidas usa as do produto; acabamento que não é mais do produto fica de fora', () => {
    const { itens } = itensDaSolicitacao([item({ acabamentos: [{ id: 'a-velho', nome: 'Antigo' }] })], [banner])
    expect(itens[0]).toMatchObject({ largura: '1', altura: '1', acabamentoIds: ['a-ilhos'] })
  })

  it('item cujo produto não existe mais é ignorado (e contado)', () => {
    const { itens, ignorados } = itensDaSolicitacao([item({}), item({ id: 'x', produtoId: null }), item({ id: 'y', produtoId: 'sumiu' })], [banner])
    expect(itens).toHaveLength(1)
    expect(ignorados).toBe(2)
  })
})
