import { describe, expect, it } from 'vitest'
import type { ComposicaoProdutoDetalhe } from '@onprint/shared'
import { assinatura, calcular, estadoDoDetalhe, notaReferencia, paraEnvio } from './estadoComposicao'

const detalhe: ComposicaoProdutoDetalhe = {
  produtoId: '00000000-0000-0000-0000-000000000001',
  modoCalculo: 'm2',
  larguraPadrao: null,
  alturaPadrao: null,
  modoCusto: 'composicao',
  custoManual: null,
  materiais: [{ insumoId: '00000000-0000-0000-0000-000000000002', codigo: 'INS1', nome: 'Lona', unidade: 'm²', custoUnitario: '9.0625', quantidade: '1.0000', base: 'por_m2', perdaPercentual: '10.00' }],
  producao: [
    { processoId: '00000000-0000-0000-0000-000000000003', nome: 'Impressão', maquinaId: null, maquinaNome: null, custoHora: '60.00', velocidadeM2Hora: '20', tempoPadraoMinutos: null, minutos: null, base: 'por_m2', setupMinutos: '0' },
  ],
  extras: [],
  lucroDesejado: null,
  lucroMinimo: null,
  precoVenda: '30.00',
  precoMinimo: null,
  referencia: { materiais: '9.97', producao: '3.00', rateio: '0.00', extras: '0.00', custoDireto: '12.97', minutosProducao: '3.0', linhas: [], porUnidade: '12.97', unidade: 'm²' },
  parametros: { percentuais: { impostos: '6', comissao: '4', custoFixo: '0' }, custoFixoHora: '0', lucroDesejadoPadrao: '30', lucroMinimoPadrao: '15' },
  analise: { lucro: '0', lucroPercentual: '0', despesasSobrePreco: '0', situacao: 'ok' },
  precoSugerido: null,
  custoCalculadoEm: null,
}

describe('estado da composição', () => {
  it('calcula ao vivo como o motor (lona + impressão automática)', () => {
    const e = estadoDoDetalhe(detalhe)
    const dados = [{ nome: 'Impressão', custoHora: '60.00', velocidadeM2Hora: '20', tempoPadraoMinutos: null }]
    const r = calcular(e, detalhe, dados)
    // 9,0625 × 1,1 = 9,97 + 3 min × R$ 1/min = 12,97
    expect(r.custo).toBe('12.97')
    expect(r.linhas.materiais[0]).toBeCloseTo(9.97, 2)
    expect(r.linhas.producao[0]).toBeCloseTo(3, 2)
    // 12,97 ÷ (1 − 0,40) = 21,62
    expect(r.sugerido).toBe('21.62')
    expect(r.analise.situacao).toBe('ok')
  })

  it('usa o custo digitado no modo simples', () => {
    const e = { ...estadoDoDetalhe(detalhe), modoCusto: 'simples' as const, custoManual: '28' }
    const r = calcular(e, detalhe, [{ nome: 'Impressão', custoHora: '60', velocidadeM2Hora: '20', tempoPadraoMinutos: null }])
    expect(r.custo).toBe('28')
    expect(r.custoComposicao).toBe('12.97')
    expect(r.analise.situacao).toBe('prejuizo')
  })

  it('monta o corpo do PUT e detecta alterações', () => {
    const e = estadoDoDetalhe(detalhe)
    const corpo = paraEnvio(e)
    expect(corpo.materiais?.[0]).toEqual({ insumoId: detalhe.materiais[0]!.insumoId, quantidade: '1', base: 'por_m2', perdaPercentual: '10' })
    expect(corpo.producao?.[0]).toMatchObject({ minutos: null, maquinaId: null, setupMinutos: '0' })
    expect(corpo.precoVenda).toBe('30.00')
    expect(assinatura(estadoDoDetalhe(detalhe))).toBe(assinatura(e))
    expect(assinatura({ ...e, precoVenda: '31,00' })).not.toBe(assinatura(e))
  })

  it('explica a medida de referência', () => {
    expect(notaReferencia({ modoCalculo: 'm2', larguraPadrao: null, alturaPadrao: null })).toBe('Calculado para 1 m²')
    expect(notaReferencia({ modoCalculo: 'm2', larguraPadrao: '2', alturaPadrao: '1' })).toContain('2 × 1 m')
  })
})
