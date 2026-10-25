import { describe, expect, it } from 'vitest'
import { fraseDoMes } from './frase'

const uso = (itens: Partial<Record<'orcamento_texto' | 'produto_texto' | 'descricao', number>>, respostas = 0) => ({
  mes: '2026-10',
  chamadas: 0,
  limiteChamadas: 300,
  percentualCusto: null,
  porRecurso: [
    { recurso: 'whatsapp_resposta' as const, chamadas: respostas, itens: 0 },
    { recurso: 'orcamento_texto' as const, chamadas: 1, itens: itens.orcamento_texto ?? 0 },
    { recurso: 'produto_texto' as const, chamadas: 1, itens: itens.produto_texto ?? 0 },
    { recurso: 'descricao' as const, chamadas: 1, itens: itens.descricao ?? 0 },
  ],
})

describe('contador do mês do Assistente', () => {
  it('fala só do que aconteceu', () => {
    expect(fraseDoMes(uso({ orcamento_texto: 12, produto_texto: 3 }))).toBe('Este mês o Assistente montou 12 item(ns) de orçamento e preencheu 3 produto(s).')
    expect(fraseDoMes(uso({ descricao: 2 }, 5))).toBe('Este mês o Assistente escreveu 2 descrição(ões) e leu 5 resposta(s) no WhatsApp.')
    expect(fraseDoMes(uso({}))).toBeNull()
  })
})
