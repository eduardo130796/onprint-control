import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TEXTOS_PADRAO_MENSAGEM, type CategoriaTemplate } from '@onprint/shared'

/** (categoria, antigo, novo) do VALUES de uma migration que troca os textos padrão não editados */
function trocas(migration: string) {
  const sql = readFileSync(join(__dirname, '../prisma/migrations', migration, 'migration.sql'), 'utf8')
  // E'...': \n vira quebra de linha, '' vira ', \\ vira \
  const literal = (s: string) => s.replace(/''/g, "'").replace(/\\(n|\\)/g, (_t, c: string) => (c === 'n' ? '\n' : '\\'))
  const re = /\(\s*'([a-z_]+)',\s*E'((?:[^']|'')*)',\s*E'((?:[^']|'')*)'\s*\)/g
  return [...sql.matchAll(re)].map((m) => ({ categoria: m[1] as CategoriaTemplate, antigo: literal(m[2]!), novo: literal(m[3]!) }))
}

/** O que o UPDATE ... WHERE categoria = v.categoria AND conteudo = v.antigo faz numa linha */
function aplicar(lista: ReturnType<typeof trocas>, linha: { categoria: string; conteudo: string }) {
  return lista.find((v) => v.categoria === linha.categoria && v.antigo === linha.conteudo)?.novo ?? linha.conteudo
}

const CATEGORIAS = ['pedido_confirmado', 'pedido_pronto', 'pedido_acompanhamento', 'pedido_em_entrega', 'pagamento_recebido'] as const

describe('migration 20261024100000_mensagens_pedido_completas', () => {
  const lista = trocas('20261024100000_mensagens_pedido_completas')
  // Textos padrão anteriores = o "novo" da migration 20261020100000 (não mudaram até esta)
  const anteriores = trocas('20261020100000_mensagens_whatsapp_formatadas')

  it('troca para os textos padrão de agora, byte a byte', () => {
    for (const c of CATEGORIAS) {
      const daqui = lista.filter((v) => v.categoria === c)
      expect(daqui.length).toBeGreaterThan(0)
      for (const v of daqui) expect(v.novo).toBe(TEXTOS_PADRAO_MENSAGEM[c])
    }
  })

  it('o texto padrão anterior (intacto) passa para o novo', () => {
    for (const c of CATEGORIAS) {
      const anterior = anteriores.find((v) => v.categoria === c)!.novo
      expect(aplicar(lista, { categoria: c, conteudo: anterior })).toBe(TEXTOS_PADRAO_MENSAGEM[c])
    }
  })

  it('os textos ainda mais antigos também passam', () => {
    for (const v of anteriores.filter((x) => (CATEGORIAS as readonly string[]).includes(x.categoria))) {
      expect(aplicar(lista, { categoria: v.categoria, conteudo: v.antigo })).toBe(TEXTOS_PADRAO_MENSAGEM[v.categoria])
    }
  })

  it('template editado (ou de outra categoria) fica como está', () => {
    const anterior = anteriores.find((v) => v.categoria === 'pedido_pronto')!.novo
    const editado = anterior.replace('Detalhes do pedido:', 'Veja aqui:')
    expect(aplicar(lista, { categoria: 'pedido_pronto', conteudo: editado })).toBe(editado)
    expect(aplicar(lista, { categoria: 'pedido_pronto', conteudo: `${anterior}\n` })).toBe(`${anterior}\n`)
    expect(aplicar(lista, { categoria: 'pedido_entregue', conteudo: anterior })).toBe(anterior)
    // Orçamento e arte não mudam nesta versão
    expect(lista.some((v) => v.categoria === 'orcamento_enviado' || v.categoria === 'arte_aprovacao')).toBe(false)
  })
})
