import { describe, expect, it } from 'vitest'
import { calcularPreco, precoPelaMargem, type AcabamentoPreco } from './pricing'

const ILHOS: AcabamentoPreco = { nome: 'Ilhós a cada 50 cm', tipoCobranca: 'por_perimetro', valor: '2.00', custo: '0.60' }
const BAINHA: AcabamentoPreco = { nome: 'Bainha', tipoCobranca: 'por_perimetro', valor: '3.00', custo: '1.00' }

describe('calcularPreco — critério de aceite da Fase 2', () => {
  it('banner 2×1 m com ilhós e bainha bate com o cálculo manual', () => {
    // Manual: área 2 × 1 = 2 m² × R$ 65 = R$ 130,00
    //         perímetro 2 × (2 + 1) = 6 m → ilhós 6 × R$ 2 = R$ 12,00; bainha 6 × R$ 3 = R$ 18,00
    //         total = R$ 160,00
    const r = calcularPreco({
      modoCalculo: 'm2',
      precoUnitario: '65.00',
      custoUnitario: '25.00',
      quantidade: 1,
      largura: '2',
      altura: '1',
      acabamentos: [ILHOS, BAINHA],
    })
    expect(r.ok).toBe(true)
    expect(r.areaUnitaria).toBe('2.000')
    expect(r.perimetroUnitario).toBe('6.000')
    expect(r.valorProduto).toBe('130.00')
    expect(r.acabamentos.map((a) => a.valor)).toEqual(['12.00', '18.00'])
    expect(r.total).toBe('160.00')
    // Custo: 2 × 25 + 6 × 0,60 + 6 × 1,00 = 59,60 → margem (160 − 59,60) / 160 = 62,75%
    expect(r.custoTotal).toBe('59.60')
    expect(r.margemPercentual).toBe('62.75')
  })
})

describe('calcularPreco — modos de cálculo', () => {
  it('unidade: quantidade × preço', () => {
    expect(calcularPreco({ modoCalculo: 'unidade', precoUnitario: '35.00', quantidade: 12 }).total).toBe('420.00')
  })

  it('m²: respeita a área mínima por peça', () => {
    const r = calcularPreco({ modoCalculo: 'm2', precoUnitario: '70', quantidade: 10, largura: '0.1', altura: '0.1', areaMinimaM2: '0.25' })
    expect(r.areaUnitaria).toBe('0.010')
    expect(r.areaCobradaUnitaria).toBe('0.250')
    expect(r.quantidadeCobrada).toBe('2.500')
    expect(r.total).toBe('175.00')
  })

  it('m²: medidas quebradas com arredondamento em centavos', () => {
    const r = calcularPreco({ modoCalculo: 'm2', precoUnitario: '65.90', quantidade: 3, largura: '1.23', altura: '0.87' })
    // 1,23 × 0,87 = 1,0701 m² × 3 = 3,2103 m² × 65,90 = 211,55877 → 211,56
    expect(r.total).toBe('211.56')
    expect(r.valorPorPeca).toBe('70.52')
  })

  it('metro linear: comprimento × quantidade × preço', () => {
    expect(calcularPreco({ modoCalculo: 'metro_linear', precoUnitario: '18.50', quantidade: 4, largura: '2.5' }).total).toBe('185.00')
  })

  it('milheiro: arredonda para o lote', () => {
    expect(calcularPreco({ modoCalculo: 'milheiro', precoUnitario: '120', quantidade: 500 }).total).toBe('120.00')
    expect(calcularPreco({ modoCalculo: 'milheiro', precoUnitario: '120', quantidade: 1000 }).total).toBe('120.00')
    const r = calcularPreco({ modoCalculo: 'milheiro', precoUnitario: '120', quantidade: 1500 })
    expect(r.quantidadeCobrada).toBe('2.000')
    expect(r.total).toBe('240.00')
  })

  it('hora: horas × preço', () => {
    expect(calcularPreco({ modoCalculo: 'hora', precoUnitario: '90', quantidade: '2.5' }).total).toBe('225.00')
  })
})

describe('calcularPreco — acabamentos', () => {
  const base = { modoCalculo: 'm2' as const, precoUnitario: '0', quantidade: 2, largura: '3', altura: '1' }

  it('cobra cada tipo sobre a base correta', () => {
    const r = calcularPreco({
      ...base,
      acabamentos: [
        { nome: 'Arte', tipoCobranca: 'fixo', valor: '50' },
        { nome: 'Embalagem', tipoCobranca: 'por_unidade', valor: '5' },
        { nome: 'Laminação', tipoCobranca: 'por_m2', valor: '15' },
        { nome: 'Bastão', tipoCobranca: 'por_metro_linear', valor: '12' },
        { nome: 'Bainha', tipoCobranca: 'por_perimetro', valor: '3' },
      ],
    })
    expect(r.acabamentos.map((a) => [a.base, a.valor])).toEqual([
      ['1.000', '50.00'], // fixo: uma vez por item
      ['2.000', '10.00'], // 2 peças
      ['6.000', '90.00'], // 3 m² × 2
      ['6.000', '72.00'], // 3 m de largura × 2
      ['16.000', '48.00'], // 2 × (3 + 1) = 8 m × 2
    ])
    expect(r.total).toBe('270.00')
  })

  it('acabamento por medida em produto sem medidas é erro', () => {
    const r = calcularPreco({ modoCalculo: 'unidade', precoUnitario: '10', quantidade: 1, acabamentos: [BAINHA] })
    expect(r.ok).toBe(false)
    expect(r.erros[0]).toMatch(/exige as medidas/)
    expect(r.total).toBe('0.00')
  })
})

describe('calcularPreco — validações', () => {
  it('rejeita medidas acima do máximo, mas aceita a peça girada', () => {
    const max = { largura: '1.6', altura: '50' }
    expect(calcularPreco({ modoCalculo: 'm2', precoUnitario: '65', quantidade: 1, largura: '3', altura: '2', medidasMaximas: max }).ok).toBe(false)
    expect(calcularPreco({ modoCalculo: 'm2', precoUnitario: '65', quantidade: 1, largura: '3', altura: '1.5', medidasMaximas: max }).ok).toBe(true)
  })

  it('exige medidas no m², quantidade positiva e milheiro inteiro', () => {
    expect(calcularPreco({ modoCalculo: 'm2', precoUnitario: '65', quantidade: 1 }).erros).toContain('Informe largura e altura (em metros).')
    expect(calcularPreco({ modoCalculo: 'unidade', precoUnitario: '10', quantidade: 0 }).ok).toBe(false)
    expect(calcularPreco({ modoCalculo: 'milheiro', precoUnitario: '10', quantidade: '1.5' }).ok).toBe(false)
  })

  it('sinaliza preço abaixo do mínimo', () => {
    expect(calcularPreco({ modoCalculo: 'unidade', precoUnitario: '9.99', precoMinimo: '10', quantidade: 1 }).abaixoDoMinimo).toBe(true)
    expect(calcularPreco({ modoCalculo: 'unidade', precoUnitario: '10', precoMinimo: '10', quantidade: 1 }).abaixoDoMinimo).toBe(false)
  })

  it('preço pela margem (markup sobre o custo)', () => {
    expect(precoPelaMargem('25', '160')).toBe('65.00')
  })
})
