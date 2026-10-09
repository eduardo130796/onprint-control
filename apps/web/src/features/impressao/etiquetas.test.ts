import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PedidoDetalhe } from '@onprint/shared'
import { chavesDoLote, formatoSalvo, proximaPosicaoSalva, salvarFormato, salvarProximaPosicao, volumesDoPedido } from './etiquetas'

const item = (id: string, ops: { id: string; cancelada?: boolean }[]) => ({
  id,
  descricao: `Item ${id}`,
  quantidade: '1',
  ordensProducao: ops.map((o) => ({ id: o.id, numero: `OP-${o.id}`, etapaAtual: 'fila', cancelada: Boolean(o.cancelada) })),
})
const pedido = { itens: [item('a', [{ id: 'op1' }, { id: 'op2', cancelada: true }]), item('b', []), item('c', [{ id: 'op3' }])] } as unknown as PedidoDetalhe

describe('volumes do pedido', () => {
  it('uma etiqueta por OP ativa; item sem OP vira um volume', () => {
    const v = volumesDoPedido(pedido)
    expect(v.map((x) => x.chave)).toEqual(['op1', 'item:b', 'op3'])
    expect(v.map((x) => `${x.indice}/${x.total}`)).toEqual(['1/3', '2/3', '3/3'])
  })

  it('lote com OPs marca só elas; sem lista, todas', () => {
    expect(chavesDoLote(pedido, ['op3'])).toEqual(['op3'])
    expect(chavesDoLote(pedido)).toEqual(['op1', 'item:b', 'op3'])
  })
})

describe('preferências no navegador', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sem armazenamento (aba anônima, bloqueio) usa o padrão e não quebra', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
      removeItem: () => {
        throw new Error('bloqueado')
      },
    })
    expect(formatoSalvo()).toBe('a4-4')
    expect(() => salvarFormato('a4-8')).not.toThrow()
    expect(proximaPosicaoSalva('a4-8')).toBeNull()
    expect(() => salvarProximaPosicao('a4-8', 7)).not.toThrow()
  })

  it('lembra o formato e onde a folha parou', () => {
    const dados = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => dados.get(k) ?? null, setItem: (k: string, v: string) => dados.set(k, v), removeItem: (k: string) => dados.delete(k) })
    salvarFormato('a4-8')
    expect(formatoSalvo()).toBe('a4-8')
    dados.set('onprint:etiquetas:formato', 'qualquer')
    expect(formatoSalvo()).toBe('a4-4')
    salvarProximaPosicao('a4-8', 7)
    expect(proximaPosicaoSalva('a4-8')).toBe(7)
    salvarProximaPosicao('a4-8', null)
    expect(proximaPosicaoSalva('a4-8')).toBeNull()
  })
})
