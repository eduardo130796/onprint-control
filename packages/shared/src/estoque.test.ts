import { describe, expect, it } from 'vitest'
import { consumoDeInsumo, custoMedioAposEntrada, situacaoEstoque } from './estoque'

describe('consumoDeInsumo', () => {
  it('aceite: banner 2 × 1 m consome 2 m² de lona + 5% de perda = 2,1 m²', () => {
    expect(consumoDeInsumo({ base: 'por_m2', quantidade: '1', perdaPercentual: '5' }, { quantidade: 1, largura: '2', altura: '1' })).toBe('2.100')
  })

  it('usa a área real (sem área mínima) multiplicada pelas peças', () => {
    // 3 placas de 0,3 × 0,2 m = 0,18 m²; ficha 1 m²/m², perda 10% → 0,198
    expect(consumoDeInsumo({ base: 'por_m2', quantidade: '1', perdaPercentual: '10' }, { quantidade: 3, largura: '0.3', altura: '0.2', areaM2: '1.5' })).toBe('0.198')
  })

  it('sem medidas usa a área informada', () => {
    expect(consumoDeInsumo({ base: 'por_m2', quantidade: '1', perdaPercentual: '0' }, { quantidade: 1, areaM2: '4.5' })).toBe('4.500')
  })

  it('por peça e por metro linear', () => {
    // 10 canecas, 1 caneca branca por peça, 2% de perda
    expect(consumoDeInsumo({ base: 'por_unidade', quantidade: '1', perdaPercentual: '2' }, { quantidade: 10 })).toBe('10.200')
    // 4 faixas de 2,5 m, 1,1 m de fita por metro
    expect(consumoDeInsumo({ base: 'por_metro_linear', quantidade: '1.1', perdaPercentual: '0' }, { quantidade: 4, largura: '2.5' })).toBe('11.000')
  })
})

describe('custoMedioAposEntrada', () => {
  it('pondera saldo e entrada', () => {
    // 100 m² a 9,50 + 50 m² a 11,00 → 10,00
    expect(custoMedioAposEntrada('100', '9.5', '50', '11')).toBe('10.0000')
  })

  it('saldo zerado ou negativo assume o custo da entrada', () => {
    expect(custoMedioAposEntrada('0', '0', '20', '8.4')).toBe('8.4000')
    expect(custoMedioAposEntrada('-2.1', '9.5', '10', '10')).toBe('10.0000')
  })
})

describe('situacaoEstoque', () => {
  it('zerado, abaixo do mínimo e normal', () => {
    expect(situacaoEstoque('0', '50')).toBe('zerado')
    expect(situacaoEstoque('-1', '0')).toBe('zerado')
    expect(situacaoEstoque('50', '50')).toBe('baixo')
    expect(situacaoEstoque('50.001', '50')).toBe('ok')
  })
})
