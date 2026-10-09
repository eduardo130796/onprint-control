import { describe, expect, it } from 'vitest'
import {
  analisarPreco,
  calcularCustoItem,
  custoDaVenda,
  custoDeReferencia,
  consumoDoAcabamento,
  custoPorUnidadeDeUso,
  fatorEmbalagem,
  markupParaLucro,
  parametrosDaEmpresa,
  precoSugerido,
  type Composicao,
} from './custos'

const banner: Composicao = {
  materiais: [
    { nome: 'Lona 440g', custoUnitario: '9.0625', unidade: 'm²', quantidade: '1', base: 'por_m2', perdaPercentual: '5' },
    { nome: 'Tinta solvente', custoUnitario: '0.18', unidade: 'ml', quantidade: '12', base: 'por_m2', perdaPercentual: '0' },
    { nome: 'Ilhós', custoUnitario: '0.08', unidade: 'un', quantidade: '4', base: 'por_unidade', perdaPercentual: '0' },
  ],
  producao: [
    // Impressora 20 m²/h a R$ 60/h (3 min/m²) + 10 min de preparo por item
    { nome: 'Impressão', custoHora: '60', minutos: null, base: 'por_m2', setupMinutos: '10', velocidadeM2Hora: '20' },
    { nome: 'Acabamento manual', custoHora: '30', minutos: '2', base: 'por_unidade', setupMinutos: '0' },
  ],
  extras: [{ nome: 'Embalagem', valor: '1.50', base: 'por_item' }],
}

describe('insumo: unidade de compra → unidade de uso', () => {
  it('rolo 3,20 × 50 m vira 160 m²; R$ 1.450 → R$ 9,0625/m²', () => {
    const f = fatorEmbalagem({ embalagem: 'rolo', largura: '3.2', comprimento: '50' }, 'm2')
    expect(f).toBe(160)
    expect(custoPorUnidadeDeUso('1450', f)).toBe('9.0625')
  })
  it('rolo usado por metro linear: o comprimento', () => {
    expect(fatorEmbalagem({ embalagem: 'rolo', largura: '1.06', comprimento: '50' }, 'm')).toBe(50)
  })
  it('caixa com 1000 ilhoses; sem conteúdo não dá custo', () => {
    expect(custoPorUnidadeDeUso('80', fatorEmbalagem({ embalagem: 'caixa', conteudo: 1000 }, 'outra'))).toBe('0.0800')
    expect(custoPorUnidadeDeUso('80', fatorEmbalagem({ embalagem: 'caixa' }, 'outra'))).toBeNull()
  })
})

describe('composição de custo', () => {
  it('banner 2 × 1 m, 1 peça: materiais + tempo de máquina + preparo + extra', () => {
    const c = calcularCustoItem(banner, { quantidade: 1, largura: 2, altura: 1 })
    // lona 2 m² × 1,05 × 9,0625 = 19,03; tinta 24 ml × 0,18 = 4,32; ilhós 4 × 0,08 = 0,32
    expect(c.materiais).toBe('23.67')
    // impressão: 2 m² × 3 min + 10 = 16 min × R$ 1/min = 16,00; manual 2 min × 0,50 = 1,00
    expect(c.producao).toBe('17.00')
    expect(c.minutosProducao).toBe('18.0')
    expect(c.extras).toBe('1.50')
    expect(c.custoDireto).toBe('42.17')
  })
  it('rateio por hora de produção', () => {
    const c = calcularCustoItem(banner, { quantidade: 1, largura: 2, altura: 1 }, { custoFixoHora: '40' })
    expect(c.rateio).toBe('12.00') // 18 min × R$ 40/h
    expect(c.custoDireto).toBe('54.17')
  })
  it('custo de referência por m² (1 × 1 m sem medida padrão)', () => {
    const r = custoDeReferencia(banner, { modoCalculo: 'm2' })
    expect(r.unidade).toBe('m²')
    // 1 m²: lona 9,52 + tinta 2,16 + ilhós 0,32 + impressão 13 min (13,00) + manual 1,00 + embalagem 1,50
    expect(r.porUnidade).toBe('27.50')
  })
})

describe('preço', () => {
  const pct = { impostos: '6', comissao: '5', custoFixo: '0' }
  it('preço sugerido divide o custo pelo que sobra dos percentuais', () => {
    // 42,17 ÷ (1 − 0,41) = 71,47
    expect(precoSugerido('42.17', pct, '30')).toBe('71.47')
    expect(precoSugerido('10', { impostos: 50, comissao: 30, custoFixo: 0 }, 20)).toBeNull()
  })
  it('análise: lucro depois de impostos e comissão, com semáforo', () => {
    expect(analisarPreco('71.47', '42.17', pct, '20')).toMatchObject({ lucro: '21.44', lucroPercentual: '30.0', situacao: 'ok' })
    expect(analisarPreco('55', '42.17', pct, '20').situacao).toBe('baixo')
    expect(analisarPreco('45', '42.17', pct, '20').situacao).toBe('prejuizo')
    expect(analisarPreco('45', '0', pct, '20').situacao).toBe('sem_custo')
  })
  it('migração do markup antigo para lucro sobre o preço', () => {
    expect(markupParaLucro('100')).toBe('50.00')
    expect(markupParaLucro('25')).toBe('20.00')
  })
  it('parâmetros da empresa: rateio por hora ou em %', () => {
    const base = { impostosPercentual: 6, comissaoPercentual: 5, custoFixoPercentual: 10, custoFixoMensal: 8000, horasProdutivasMes: 160, lucroDesejadoPadrao: 30, lucroMinimoPadrao: 15 }
    expect(parametrosDaEmpresa({ ...base, rateioModo: 'por_hora' })).toEqual({ percentuais: { impostos: 6, comissao: 5, custoFixo: 0 }, custoFixoHora: '50.0000' })
    expect(parametrosDaEmpresa({ ...base, rateioModo: 'percentual' }).percentuais.custoFixo).toBe(10)
  })
})

describe('item vendido (orçamento/pedido/PDV)', () => {
  const ilhos = { nome: 'Ilhós', tipoCobranca: 'por_perimetro' as const, custo: '0.50', materiais: [{ nome: 'Ilhós metálico', custoUnitario: '0.08', unidade: 'un', quantidade: '2', perdaPercentual: '5' }] }
  it('acabamento: consumo do insumo por metro de perímetro (2 ilhoses por metro, 5% de perda)', () => {
    // banner 2 × 1: perímetro 6 m → 12,6 ilhoses
    expect(consumoDoAcabamento(ilhos, ilhos.materiais[0] as (typeof ilhos.materiais)[number], { quantidade: 1, largura: 2, altura: 1 })).toBe('12.600')
  })
  it('composição + acabamento, com medidas reais', () => {
    const c = custoDaVenda({ produto: { modoCusto: 'composicao', modoCalculo: 'm2', custoUnitario: '0', composicao: banner }, acabamentos: [ilhos], medidas: { quantidade: 1, largura: 2, altura: 1 } })
    // 42,17 (composição) + 3,00 (6 m × 0,50) + 1,01 (12,6 × 0,08)
    expect(c.acabamentos).toBe('4.01')
    expect(c.custoDireto).toBe('46.18')
  })
  it('modo simples: custo por m² × área REAL (a área mínima é só cobrança)', () => {
    const c = custoDaVenda({ produto: { modoCusto: 'simples', modoCalculo: 'm2', custoUnitario: '20' }, acabamentos: [], medidas: { quantidade: 2, largura: 0.3, altura: 0.3 } })
    expect(c.produto).toBe('3.60')
    expect(c.custoDireto).toBe('3.60')
  })
  it('milheiro: custo por milheiro proporcional às peças', () => {
    expect(custoDaVenda({ produto: { modoCusto: 'simples', modoCalculo: 'milheiro', custoUnitario: '80' }, acabamentos: [], medidas: { quantidade: 2500 } }).custoDireto).toBe('200.00')
  })
})
