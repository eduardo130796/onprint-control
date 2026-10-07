import { describe, expect, it } from 'vitest'
import type { StatusConfig } from '@onprint/shared'
import { colunaDoRegistro, destinoDaColuna, montarColunas, personalizadoValido } from './colunasStatus'

const st = (codigo: string, ordem: number, extra: Partial<StatusConfig> = {}): StatusConfig => ({
  id: `id-${codigo}`,
  entidade: 'pedido',
  codigo,
  rotulo: codigo,
  cor: '#000000',
  ordem,
  ehFinal: false,
  sistema: true,
  base: null,
  ativo: true,
  ...extra,
})
const status = [
  st('em_producao', 2),
  st('pronto', 3),
  st('entregue', 5),
  st('p_aguardando_pagamento', 3, { sistema: false, base: 'pronto' }),
  st('em_entrega', 4, { ativo: false }),
]

describe('colunas com status próprios', () => {
  it('registro vai para a coluna própria só enquanto o status é a base', () => {
    expect(colunaDoRegistro(status, 'pronto', 'id-p_aguardando_pagamento')).toBe('p_aguardando_pagamento')
    expect(colunaDoRegistro(status, 'entregue', 'id-p_aguardando_pagamento')).toBe('entregue')
    expect(personalizadoValido(status, 'entregue', 'id-p_aguardando_pagamento')).toBeNull()
    expect(personalizadoValido(status, 'pronto', 'id-p_aguardando_pagamento')).toBe('id-p_aguardando_pagamento')
  })

  it('coluna própria resolve para a base + id; a do sistema, para ela mesma', () => {
    expect(destinoDaColuna(status, 'p_aguardando_pagamento')).toEqual({ base: 'pronto', personalizadoId: 'id-p_aguardando_pagamento' })
    expect(destinoDaColuna(status, 'pronto')).toEqual({ base: 'pronto', personalizadoId: null })
  })

  it('ordena a própria logo depois da base e esconde coluna oculta vazia', () => {
    const colunas = montarColunas(status, [{ s: 'pronto', p: 'id-p_aguardando_pagamento' }], (i) => i.s, (i) => i.p)
    expect(colunas.map((c) => c.id)).toEqual(['em_producao', 'pronto', 'p_aguardando_pagamento', 'entregue'])
    expect(colunas.find((c) => c.id === 'p_aguardando_pagamento')?.itens).toHaveLength(1)
  })

  it('coluna oculta aparece (marcada) quando tem cartões', () => {
    const colunas = montarColunas(status, [{ s: 'em_entrega', p: null }], (i) => i.s, (i) => i.p)
    expect(colunas.find((c) => c.id === 'em_entrega')?.titulo).toBe('em_entrega (oculto)')
  })
})
