import { describe, expect, it } from 'vitest'
import {
  causaCustoInsumo,
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
