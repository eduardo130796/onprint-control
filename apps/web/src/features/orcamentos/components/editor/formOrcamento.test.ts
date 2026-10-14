import { describe, expect, it } from 'vitest'
import { orcamentoSchema, type OrcamentoDetalhe, type ProdutoCatalogo, type SolicitacaoItem } from '@onprint/shared'
import { formDoOrcamento, itensDaSolicitacao, payloadDoForm } from './formOrcamento'
import { calcularItem } from './useCalculoOrcamento'

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

describe('reabrir orçamento salvo com valores grandes', () => {
  const lona = { ...banner, id: '3b0e1c52-7d4a-4f6e-9b21-5a8c0d7e6f13' } as ProdutoCatalogo
  const caneca = { ...banner, id: '6f1c7a3e-2b4d-4c8e-9a1f-0e2d3c4b5a69', codigo: 'PRD-0002', nome: 'Caneca', modoCalculo: 'unidade', precoVenda: '35.00', larguraPadrao: null, alturaPadrao: null, larguraMaxima: null, alturaMaxima: null, acabamentos: [] } as unknown as ProdutoCatalogo
  const itemSalvo = (id: string, produto: ProdutoCatalogo, campos: { quantidade: string; largura?: string | null; altura?: string | null; precoUnitario: string; desconto?: string }) => ({
    id,
    produtoId: produto.id,
    produto: { id: produto.id, codigo: produto.codigo, nome: produto.nome, modoCalculo: produto.modoCalculo },
    descricao: produto.nome,
    largura: null,
    altura: null,
    desconto: '0',
    acabamentos: [],
    observacao: null,
    ...campos,
  })
  // Como a API devolve (Prisma Decimal): "1000", "10000", "14000"
  const salvo = {
    cliente: { id: '0d9f8e7c-6b5a-4f3e-8d2c-1b0a9f8e7d6c', nome: 'Cliente', nomeFantasia: null },
    validade: '2026-10-30T00:00:00.000Z',
    desconto: '9',
    acrescimo: '1400',
    frete: '0',
    condicoes: null,
    observacoes: null,
    observacoesInternas: null,
    itens: [
      itemSalvo('i1', caneca, { quantidade: '1000', precoUnitario: '14', desconto: '1400' }),
      itemSalvo('i2', caneca, { quantidade: '10000.000', precoUnitario: '1.4' }),
      itemSalvo('i3', lona, { quantidade: '1', largura: '1000.5', altura: '2.500', precoUnitario: '14000' }),
    ],
  } as unknown as OrcamentoDetalhe

  it('quantidade e medida ≥ 1.000 voltam sem separador de milhar (nada de "1.000" = 1)', () => {
    const f = formDoOrcamento(salvo)
    expect(f.itens.map((i) => [i.quantidade, i.largura, i.altura])).toEqual([
      ['1000', '', ''],
      ['10000', '', ''],
      ['1', '1000,5', '2,5'],
    ])
    expect(f.itens.map((i) => i.precoUnitario)).toEqual(['14,00', '1,40', '14.000,00'])
    expect([f.desconto, f.acrescimo, f.itens[0]?.desconto]).toEqual(['9,00', '1.400,00', '1.400,00'])
  })

  it('o cálculo ao vivo e o que vai para a API batem com o salvo', () => {
    const f = formDoOrcamento(salvo)
    expect(calcularItem(f.itens[0]!, caneca).total).toBe('12600.00')
    expect(calcularItem(f.itens[1]!, caneca).total).toBe('14000.00')
    const enviado = orcamentoSchema.parse(payloadDoForm(f))
    expect(enviado.itens.map((i) => [i.quantidade, i.largura, i.altura, i.precoUnitario, i.desconto])).toEqual([
      ['1000', null, null, '14.00', '1400.00'],
      ['10000', null, null, '1.40', '0.00'],
      ['1', '1000.5', '2.5', '14000.00', '0.00'],
    ])
    expect([enviado.desconto, enviado.acrescimo]).toEqual(['9.00', '1400.00'])
  })
})
