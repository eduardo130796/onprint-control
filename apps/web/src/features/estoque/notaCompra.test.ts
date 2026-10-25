import { describe, expect, it } from 'vitest'
import type { ItemOrcamentoSugerido } from '@onprint/shared'
import { pareceFrase } from '@/features/assistente/abrirAssistente'
import { clienteNovoCompleto } from '@/features/orcamentos/components/editor/clienteNovo'
import { itensDoAssistente } from '@/features/orcamentos/components/editor/formOrcamento'
import { valoresDaLinha, type Embalagem } from './embalagem'
import { ehUnidadeDeEmbalagem, fecharParcelas, juntarIguais, nomeDoInsumo, parcelasDaNota, unidadeDoInsumoNovo, valoresDoItem } from './notaCompra'
import { totalDaEntrada } from './pagamento'

const ROLO: Embalagem = { tipo: 'rolo', fator: 160, sigla: 'm²', precoEmbalagem: null }

describe('Nota de compra na entrada de estoque', () => {
  it('item em embalagens (2 rolos × custo com rateio) vira m² e custo por m² ao salvar', () => {
    const v = valoresDoItem({ quantidade: '2', custoUnitario: '1469.2177', emEmbalagem: true }, ROLO)
    expect(v).toMatchObject({ porEmbalagem: true, embalagens: '2', precoEmbalagem: '1.469,22' })
    const linha = { ...v, embalagem: ROLO }
    expect(valoresDaLinha(linha)).toEqual({ quantidade: '320', custoUnitario: '9.1826' })
    // Sem embalagem: direto na unidade de uso, sem separador de milhar
    expect(valoresDoItem({ quantidade: '1000', custoUnitario: '0.4123', emEmbalagem: false }, null)).toMatchObject({ porEmbalagem: false, quantidade: '1000', custoUnitario: '0,4123' })
    expect(ehUnidadeDeEmbalagem('RL')).toBe(true)
    expect(ehUnidadeDeEmbalagem('UN')).toBe(false)
  })

  it('o mesmo insumo em duas linhas da nota vira uma (soma e custo médio ponderado)', () => {
    const r = juntarIguais([
      { produtoId: 'a', quantidade: '2', custoUnitario: '10' },
      { produtoId: 'b', quantidade: '1', custoUnitario: '5' },
      { produtoId: 'a', quantidade: '3', custoUnitario: '20' },
      { produtoId: undefined, quantidade: '1', custoUnitario: '1' },
    ])
    expect(r).toEqual([
      { produtoId: 'a', quantidade: '5', custoUnitario: '16' },
      { produtoId: 'b', quantidade: '1', custoUnitario: '5' },
      { produtoId: undefined, quantidade: '1', custoUnitario: '1' },
    ])
  })

  it('parcelas das duplicatas fecham com o total (centavos na última); diferença grande fica para a pessoa', () => {
    const parcelas = parcelasDaNota({ parcelas: [{ numero: '001', vencimento: '2026-11-19', valor: '1720.15' }, { numero: '002', vencimento: '2026-12-19', valor: '1720.15' }] })
    expect(parcelas).toEqual([{ vencimento: '2026-11-19', valor: '1.720,15' }, { vencimento: '2026-12-19', valor: '1.720,15' }])
    const total = totalDaEntrada([{ quantidade: '320', custoUnitario: '9.1826' }, { quantidade: '3', custoUnitario: '38.9978' }, { quantidade: '2', custoUnitario: '192.4337' }])
    expect(fecharParcelas(parcelas, total).at(-1)!.valor).not.toBe('1.720,15')
    expect(fecharParcelas(parcelas, '3440.30')).toBe(parcelas)
    expect(fecharParcelas(parcelas, '3000.00')).toBe(parcelas)
  })

  it('insumo novo da nota: nome legível e unidade do cadastro', () => {
    expect(nomeDoInsumo('ILHOS LATAO N10 CX 1000')).toBe('Ilhos latao n10 cx 1000')
    expect(nomeDoInsumo('LONA FRONT 440G BRANCA')).toBe('Lona front 440G branca')
    expect(nomeDoInsumo('Tinta sublimática magenta')).toBe('Tinta sublimática magenta')
    const unidades = [{ id: 'un', sigla: 'un' }, { id: 'l', sigla: 'l' }, { id: 'kg', sigla: 'kg' }]
    expect(unidadeDoInsumoNovo('LT', unidades)).toBe('l')
    expect(unidadeDoInsumoNovo('KG', unidades)).toBe('kg')
    expect(unidadeDoInsumoNovo('CX', unidades)).toBe('un')
  })
})

describe('Peça ao Assistente na tela', () => {
  it('a busca oferece o Assistente primeiro quando é uma frase, pergunta ou documento', () => {
    expect(pareceFrase('quem está devendo?')).toBe(true)
    expect(pareceFrase('2 banners e mil cartões')).toBe(true)
    expect(pareceFrase('11.222.333/0001-81')).toBe(true)
    expect(pareceFrase('Padaria')).toBe(false)
    expect(pareceFrase('PED-2026')).toBe(false)
  })

  it('orçamento aberto já montado: incertos com "confira"; o que não achou vira linha para escolher o produto', () => {
    const base: Omit<ItemOrcamentoSugerido, 'produto'> = { descricao: '2 banners', quantidade: '2', largura: '3', altura: '1', acabamentos: [], observacao: null, confianca: 0.9, motivo: 'x', conferir: false, avisos: [], preco: null }
    const [certo, duvida, semProduto] = itensDoAssistente([
      { ...base, produto: { id: 'p1', nome: 'Banner', codigo: 'PRD-1', modoCalculo: 'm2', precisaArte: true } },
      { ...base, quantidade: '1000', produto: { id: 'p2', nome: 'Cartão', codigo: 'PRD-2', modoCalculo: 'milheiro', precisaArte: false }, conferir: true, avisos: ['O pedido não diz a medida.'] },
      { ...base, descricao: '3 canecas', quantidade: '3', largura: null, altura: null, produto: null, conferir: true },
    ])
    expect(certo).toMatchObject({ produto: { id: 'p1' }, quantidade: '2', largura: '3', sugerido: true, conferir: null })
    expect(duvida).toMatchObject({ quantidade: '1000', conferir: 'O pedido não diz a medida.' })
    expect(semProduto).toMatchObject({ produto: null, quantidade: '3', conferir: expect.stringContaining('“3 canecas”') })
  })

  it('cliente novo só é cadastrado com nome e um contato', () => {
    const novo = { nome: 'Padaria Pão Quente', tipoPessoa: 'PJ' as const, documento: null, whatsapp: '11977776666', telefone: null, email: null }
    expect(clienteNovoCompleto(novo)).toBe(true)
    expect(clienteNovoCompleto({ ...novo, whatsapp: null })).toBe(false)
    expect(clienteNovoCompleto({ ...novo, nome: ' ' })).toBe(false)
  })
})
