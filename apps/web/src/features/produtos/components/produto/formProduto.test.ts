import { describe, expect, it, vi } from 'vitest'
import type { ProdutoSugerido } from '@onprint/shared'
import { preencherFormulario } from './formProduto'

const sugestao: ProdutoSugerido = {
  nome: 'Adesivo vinil com recorte',
  tipo: 'produto',
  categoria: { id: 'c-adesivos', nome: 'Adesivos' },
  modoCalculo: 'm2',
  unidadeMedidaId: 'u-m2',
  larguraPadrao: null,
  alturaPadrao: null,
  prazoProducaoDias: null,
  precisaArte: true,
  insumos: [],
  processos: [],
  acabamentos: [],
  margem: '60',
  descricao: 'Adesivo em vinil branco brilho, recortado no formato da sua arte.',
  avisos: [],
}

describe('"Preencher com o Assistente" no cadastro do produto', () => {
  it('preenche só a aba Geral (nunca preço ou custo) e devolve os campos para o selo', () => {
    const setValue = vi.fn()
    const campos = preencherFormulario({ setValue } as never, sugestao)
    expect(Object.fromEntries(setValue.mock.calls.map(([c, v]) => [c, v]))).toEqual({
      nome: 'Adesivo vinil com recorte',
      tipo: 'produto',
      modoCalculo: 'm2',
      precisaArte: true,
      categoriaId: 'c-adesivos',
      unidadeMedidaId: 'u-m2',
      descricao: 'Adesivo em vinil branco brilho, recortado no formato da sua arte.',
    })
    expect(campos).not.toContain('precoVenda')
    expect(campos).not.toContain('custo')
    expect(setValue.mock.calls.every(([, , o]) => o.shouldDirty)).toBe(true)
  })
  it('categoria nova (sem id) não vai para o campo; medidas e prazo só quando vieram', () => {
    const setValue = vi.fn()
    const campos = preencherFormulario({ setValue } as never, { ...sugestao, categoria: { id: null, nome: 'Brindes' }, larguraPadrao: '1.5', alturaPadrao: '1', prazoProducaoDias: 3 })
    expect(campos).not.toContain('categoriaId')
    expect(Object.fromEntries(setValue.mock.calls.map(([c, v]) => [c, v]))).toMatchObject({ larguraPadrao: '1,500', alturaPadrao: '1,000', prazoProducaoDias: '3' })
  })
})
