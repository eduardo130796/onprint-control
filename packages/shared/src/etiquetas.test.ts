import { describe, expect, it } from 'vitest'
import { distribuirEtiquetas, faltamParaCompletar, filaEtiquetasAdicionarSchema, posicaoInicialValida } from './etiquetas'

describe('distribuirEtiquetas', () => {
  it('uma etiqueta numa folha nova de 4: sobram 3', () => {
    const d = distribuirEtiquetas(1, 'a4-4')
    expect(d.paginas).toEqual([[0, null, null, null]])
    expect(d.folhas).toBe(1)
    expect(d.sobram).toBe(3)
    expect(d.proximaPosicao).toBe(2)
  })

  it('6 etiquetas em A4 com 8: 1 folha, sobram 2', () => {
    const d = distribuirEtiquetas(6, 'a4-8')
    expect(d.folhas).toBe(1)
    expect(d.sobram).toBe(2)
    expect(d.paginas[0]).toEqual([0, 1, 2, 3, 4, 5, null, null])
    expect(d.proximaPosicao).toBe(7)
  })

  it('começa na posição 3: as casas 1 e 2 ficam em branco', () => {
    const d = distribuirEtiquetas(3, 'a4-4', 3)
    expect(d.paginas).toEqual([
      [null, null, 0, 1],
      [2, null, null, null],
    ])
    expect(d.folhas).toBe(2)
    expect(d.sobram).toBe(3)
  })

  it('fecha folhas inteiras: sem sobra e próxima em folha nova', () => {
    const d = distribuirEtiquetas(6, 'a4-8', 3)
    expect(d.paginas).toEqual([[null, null, 0, 1, 2, 3, 4, 5]])
    expect(d.sobram).toBe(0)
    expect(d.proximaPosicao).toBeNull()
  })

  it('várias folhas mantêm a ordem das etiquetas', () => {
    const d = distribuirEtiquetas(10, 'a4-4')
    expect(d.folhas).toBe(3)
    expect(d.paginas.flat().filter((i) => i !== null)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(d.sobram).toBe(2)
  })

  it('rolo térmico: uma por página e ignora a posição inicial', () => {
    const d = distribuirEtiquetas(3, 'termica-100x150', 5)
    expect(d.paginas).toEqual([[0], [1], [2]])
    expect(d.sobram).toBe(0)
  })

  it('nenhuma etiqueta: nenhuma página', () => {
    expect(distribuirEtiquetas(0, 'a4-4', 2)).toEqual({ paginas: [], folhas: 0, sobram: 0, proximaPosicao: null })
  })

  it('posição inicial fora da folha é ajustada', () => {
    expect(posicaoInicialValida('a4-4', 9)).toBe(4)
    expect(posicaoInicialValida('a4-8', 0)).toBe(1)
    expect(posicaoInicialValida('a4-8', Number.NaN)).toBe(1)
  })

  it('faltam para completar a folha', () => {
    expect(faltamParaCompletar(6, 'a4-8')).toBe(2)
    expect(faltamParaCompletar(4, 'a4-4')).toBe(0)
  })
})

describe('fila de etiquetas', () => {
  it('exige ao menos uma OP ou pedido', () => {
    expect(filaEtiquetasAdicionarSchema.safeParse({}).success).toBe(false)
    expect(filaEtiquetasAdicionarSchema.safeParse({ opIds: ['3f2b8c1e-4a5d-4c6e-9f7a-1b2c3d4e5f60'] }).success).toBe(true)
  })
})
