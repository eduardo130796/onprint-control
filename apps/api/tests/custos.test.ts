import { describe, expect, it } from 'vitest'
import {
  acabamentosNaReferencia,
  analisarDocumento,
  causaCustoInsumo,
  custoDoItemVendido,
  horasDaComposicao,
  linhasDoDetalhe,
  quantidadeComPerda,
  mensagemReajuste,
  modoDoInsumo,
  parametrosPreco,
  quePioraram,
  referenciaDoProduto,
  resolverProducao,
  situacaoDoProduto,
  usoDaUnidade,
  type LinhaProducao,
} from '../src/modules/produtos/custos'
import { linhaLucratividade, totaisLucratividade } from '../src/modules/relatorios/lucratividade'

const plotter = { id: 'm1', nome: 'Plotter', custoHora: '45', velocidadeM2Hora: '12' }
const semCusto = { id: 'm2', nome: 'Guilhotina', custoHora: '0', velocidadeM2Hora: null }
const processo = (extra: Partial<LinhaProducao['processo']> = {}) => ({ id: 'p1', nome: 'Impressão', custoHora: '20', tempoPadraoMinutos: 15, maquinaPadrao: null, ...extra })
const linha = (extra: Partial<LinhaProducao> = {}): LinhaProducao => ({ minutos: null, base: 'por_m2', setupMinutos: '0', maquina: null, processo: processo(), ...extra })

describe('resolverProducao: custo/hora', () => {
  it('usa o custo/hora da máquina da linha', () => {
    expect(resolverProducao(linha({ maquina: plotter })).custoHora).toBe('45.00')
  })

  it('sem máquina na linha usa a máquina padrão do processo', () => {
    const r = resolverProducao(linha({ processo: processo({ maquinaPadrao: plotter }) }))
    expect(r.custoHora).toBe('45.00')
    expect(r.maquina?.id).toBe('m1')
  })

  it('máquina sem custo/hora cai para o custo/hora do processo (mão de obra)', () => {
    expect(resolverProducao(linha({ maquina: semCusto })).custoHora).toBe('20.00')
    expect(resolverProducao(linha()).custoHora).toBe('20.00')
  })
})

describe('resolverProducao: minutos', () => {
  it('minutos digitados valem na base escolhida', () => {
    const r = resolverProducao(linha({ minutos: '3', base: 'por_unidade', maquina: plotter }))
    expect([r.minutos, r.base]).toEqual(['3', 'por_unidade'])
  })

  it('vazio + por m² + máquina com velocidade: o motor usa 60 ÷ velocidade', () => {
    const r = resolverProducao(linha({ maquina: plotter }))
    expect([r.minutos, r.base, r.velocidadeM2Hora]).toEqual([null, 'por_m2', '12'])
  })

  it('vazio nos demais casos: tempo padrão do processo, por item', () => {
    expect(resolverProducao(linha({ base: 'por_unidade', maquina: plotter }))).toMatchObject({ minutos: '15', base: 'por_item' })
    expect(resolverProducao(linha({ maquina: semCusto }))).toMatchObject({ minutos: '15', base: 'por_item' })
    expect(resolverProducao(linha({ processo: processo({ tempoPadraoMinutos: null }), base: 'por_unidade' }))).toMatchObject({ minutos: '0', base: 'por_item' })
  })
})

describe('referenciaDoProduto', () => {
  it('adesivo do exemplo: vinil + tinta + plotter pela velocidade + corte = R$ 22,24/m²', () => {
    const ref = referenciaDoProduto(
      {
        modoCalculo: 'm2',
        larguraPadrao: null,
        alturaPadrao: null,
        insumos: [
          { quantidade: '1', base: 'por_m2', perdaPercentual: '8', insumo: { nome: 'Vinil', custo: '12.0000', unidadeMedida: { sigla: 'm²' } } },
          { quantidade: '10', base: 'por_m2', perdaPercentual: '5', insumo: { nome: 'Tinta', custo: '0.0900', unidadeMedida: { sigla: 'ml' } } },
        ],
        processos: [
          linha({ maquina: plotter, setupMinutos: '5' }),
          linha({ minutos: '2', processo: processo({ nome: 'Corte', custoHora: '25' }) }),
        ],
        custosExtras: [],
      },
      parametrosPreco(null),
    )
    // 12 × 1,08 + 0,09 × 10,5 = 13,905; (5 + 5) min × R$ 45/h = 7,50; 2 min × R$ 25/h = 0,83
    expect([ref.materiais, ref.producao, ref.custoDireto, ref.porUnidade, ref.unidade]).toEqual(['13.91', '8.33', '22.24', '22.24', 'm²'])
  })
})

describe('parâmetros e situação', () => {
  const cfg = {
    impostosPercentual: '6',
    comissaoPercentual: '5',
    custoFixoPercentual: '10',
    rateioModo: 'por_hora',
    custoFixoMensal: '8800',
    horasProdutivasMes: 176,
    lucroDesejadoPadrao: '30',
    lucroMinimoPadrao: '15',
  }

  it('rateio por hora: custo fixo mensal ÷ horas; o % só vale no modo percentual', () => {
    const p = parametrosPreco(cfg)
    expect(p.custoFixoHora).toBe('50.0000')
    expect(p.percentuais).toEqual({ impostos: '6.00', comissao: '5.00', custoFixo: '0.00' })
    expect(parametrosPreco({ ...cfg, rateioModo: 'percentual' }).percentuais.custoFixo).toBe('10.00')
  })

  it('sem configuração: tudo zero e lucro 30/15', () => {
    expect(parametrosPreco(null)).toMatchObject({ custoFixoHora: '0.0000', lucroDesejadoPadrao: '30.00', lucroMinimoPadrao: '15.00' })
  })

  it('lucro mínimo do produto ou o padrão da empresa', () => {
    const p = parametrosPreco(cfg)
    // preço 100, custo 70, 11% de despesas → lucro 19%
    expect(situacaoDoProduto({ precoVenda: '100', custo: '70', lucroMinimo: null }, p).situacao).toBe('ok')
    expect(situacaoDoProduto({ precoVenda: '100', custo: '70', lucroMinimo: '20' }, p).situacao).toBe('baixo')
    expect(situacaoDoProduto({ precoVenda: '100', custo: '95', lucroMinimo: null }, p).situacao).toBe('prejuizo')
    expect(situacaoDoProduto({ precoVenda: '100', custo: '0', lucroMinimo: null }, p).situacao).toBe('sem_custo')
  })
})

describe('aviso de reajuste', () => {
  it('só conta quem passou de ok/sem custo para baixo/prejuízo', () => {
    const r = quePioraram([
      { id: '1', nome: 'A', antes: 'ok', depois: 'baixo' },
      { id: '2', nome: 'B', antes: 'baixo', depois: 'prejuizo' },
      { id: '3', nome: 'C', antes: 'sem_custo', depois: 'prejuizo' },
      { id: '4', nome: 'D', antes: 'ok', depois: 'ok' },
    ])
    expect(r.map((m) => m.id)).toEqual(['1', '3'])
  })

  it('mensagem com o custo antes e depois', () => {
    expect(mensagemReajuste(causaCustoInsumo('Lona 440g', '8.9', '9.52', 'm²'), 3)).toBe('O custo de Lona 440g subiu (R$ 8,90 → R$ 9,52/m²): 3 produtos ficaram abaixo do lucro mínimo.')
    expect(mensagemReajuste('A precificação da empresa mudou', 1)).toBe('A precificação da empresa mudou: 1 produto ficou abaixo do lucro mínimo.')
  })
})

describe('unidade de uso do insumo', () => {
  it('m² e metro convertem rolo/chapa; o resto usa o conteúdo', () => {
    expect([usoDaUnidade('m²'), usoDaUnidade('m'), usoDaUnidade('ml'), usoDaUnidade(null)]).toEqual(['m2', 'm', 'outra', 'outra'])
    expect([modoDoInsumo('m²'), modoDoInsumo('m'), modoDoInsumo('un')]).toEqual(['m2', 'metro_linear', 'unidade'])
  })
})

// ─── Fase 3: item vendido, lucro no orçamento, perda apontada e lucratividade ───

const ilhos = {
  nome: 'Ilhós',
  tipoCobranca: 'por_perimetro' as const,
  custo: '0.50',
  valor: '1.00',
  insumos: [{ quantidade: '2', perdaPercentual: '5', insumo: { nome: 'Ilhós metálico', custo: '0.08', unidadeMedida: { sigla: 'un' } } }],
}
const semComposicao = { insumos: [], processos: [], custosExtras: [], larguraPadrao: null, alturaPadrao: null }
const par10 = { percentuais: { impostos: '10.00', comissao: '0.00', custoFixo: '0.00' }, custoFixoHora: '0.0000', lucroDesejadoPadrao: '30.00', lucroMinimoPadrao: '15.00' }

describe('custo do item vendido', () => {
  it('modo simples: custo por m² × área real + acabamento com insumos', () => {
    const c = custoDoItemVendido({ ...semComposicao, modoCusto: 'simples', modoCalculo: 'm2', custo: '20' }, [ilhos], { quantidade: 1, largura: 2, altura: 1 }, par10)
    // 2 m² × 20 + perímetro 6 m × 0,50 + 12,6 ilhoses × 0,08
    expect([c.produto, c.acabamentos, c.custoDireto]).toEqual(['40.00', '4.01', '44.01'])
    expect(c.linhas.map((l) => l.grupo)).toEqual(['produto', 'acabamento', 'acabamento'])
  })
  it('composição usa a produção da composição (não o custo digitado)', () => {
    const plotter = { id: 'm1', nome: 'Plotter', custoHora: '45', velocidadeM2Hora: '12' }
    const p = { ...semComposicao, modoCusto: 'composicao', modoCalculo: 'm2' as const, custo: '999', processos: [linha({ maquina: plotter })] }
    // 6 m² × 5 min/m² = 30 min × R$ 45/h
    expect(custoDoItemVendido(p, [], { quantidade: 3, largura: 2, altura: 1 }, par10).custoDireto).toBe('22.50')
    expect(horasDaComposicao(p, { quantidade: 3, largura: 2, altura: 1 })).toBe('0.50')
  })
})

describe('lucro no orçamento/pedido', () => {
  const itens = [
    { total: '100', custoEstimado: '44.01', lucroMinimo: null, linhas: [] },
    { total: '50', custoEstimado: '48', lucroMinimo: '20' },
  ]
  it('quem vê custos recebe os números; o total considera o desconto do cabeçalho', () => {
    const a = analisarDocumento(itens, par10, true, { desconto: '10' })
    expect(a.itens[0]).toMatchObject({ situacao: 'ok', custoDireto: '44.01', lucro: '45.99', despesasSobrePreco: '10.00', linhas: [] })
    expect(a.itens[1]).toMatchObject({ situacao: 'prejuizo', lucro: '-3.00' })
    // 150 − 10 = 140; 140 − 14 − 92,01 = 33,99
    expect(a.total).toMatchObject({ situacao: 'ok', custoDireto: '92.01', lucro: '33.99', lucroPercentual: '24.3' })
  })
  it('sem permissão de custos: só a situação (semáforo)', () => {
    const a = analisarDocumento(itens, par10, false)
    expect(a.itens).toEqual([{ situacao: 'ok' }, { situacao: 'prejuizo' }])
    expect(Object.keys(a.total)).toEqual(['situacao'])
  })
  it('linhas do custo gravado (itens antigos não têm)', () => {
    expect(linhasDoDetalhe({ linhas: [{ grupo: 'produto' }] })).toHaveLength(1)
    expect(linhasDoDetalhe(null)).toBeNull()
  })
})

describe('produção e reajuste', () => {
  it('perda apontada soma na quantidade baixada', () => {
    expect(quantidadeComPerda('10', ['1', '0.5'])).toBe('11.500')
    expect(quantidadeComPerda('2', [])).toBe('2.000')
  })
  it('acabamentos obrigatórios na medida de referência (1 m²)', () => {
    // perímetro 4 m: 4 × 0,50 + 8,4 ilhoses × 0,08 = 2,67; preço 4 × 1,00
    expect(acabamentosNaReferencia({ modoCalculo: 'm2', larguraPadrao: null, alturaPadrao: null }, [ilhos])).toEqual({ custo: '2.6700', preco: '4.00' })
  })
})

describe('lucratividade', () => {
  it('despesas sobre a receita, lucro pelo custo estimado e real de materiais comparativo', () => {
    const l = linhaLucratividade({ id: 'p', titulo: 'PED-1', subtitulo: 'Cliente', receita: '1000', custo: '600', real: '550', lucroMinimo: null }, par10)
    expect(l).toMatchObject({ receita: '1000.00', custoEstimado: '600.00', custoMateriaisReal: '550.00', despesas: '100.00', lucro: '300.00', lucroPercentual: '30.0', situacao: 'ok' })
    const sem = linhaLucratividade({ id: 'q', titulo: 'PED-2', subtitulo: null, receita: '100', custo: '95', real: null, lucroMinimo: null }, par10)
    expect([sem.custoMateriaisReal, sem.situacao]).toEqual([null, 'prejuizo'])
    expect(totaisLucratividade([l, sem], par10).totais).toMatchObject({ receita: '1100.00', custoEstimado: '695.00', custoMateriaisReal: '550.00', lucro: '295.00', situacao: 'ok' })
  })

  it('venda sem custo fica fora do lucro total (não infla para 100%)', () => {
    const l = linhaLucratividade({ id: 'p', titulo: 'PED-1', subtitulo: null, receita: '1000', custo: '600', real: null, lucroMinimo: null }, par10)
    const semCusto = linhaLucratividade({ id: 'q', titulo: 'PED-2', subtitulo: null, receita: '500', custo: '0', real: null, lucroMinimo: null }, par10)
    expect(semCusto.situacao).toBe('sem_custo')
    const t = totaisLucratividade([l, semCusto], par10)
    expect(t.totais).toMatchObject({ receita: '1500.00', custoEstimado: '600.00', lucro: '300.00', lucroPercentual: '30.0', situacao: 'ok' })
    expect(t.semCusto).toEqual({ quantidade: 1, receita: '500.00' })
    expect(totaisLucratividade([semCusto], par10).totais.situacao).toBe('sem_custo')
  })
})
