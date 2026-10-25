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

describe('migration 20261025100000_orcamento_pagamento', () => {
  const lista = trocas('20261025100000_orcamento_pagamento')
  const anteriores = trocas('20261020100000_mensagens_whatsapp_formatadas')
  const padraoAnterior = anteriores.find((v) => v.categoria === 'orcamento_enviado')!
  // O texto padrão desta versão = o "antigo" da migration seguinte (20261027100000_whatsapp_respostas)
  const padraoDaVersao = trocas('20261027100000_whatsapp_respostas')[0]!.antigo

  it('só mexe no orçamento e troca para o texto padrão da versão, byte a byte', () => {
    expect(lista.length).toBeGreaterThan(0)
    for (const v of lista) {
      expect(v.categoria).toBe('orcamento_enviado')
      expect(v.novo).toBe(padraoDaVersao)
    }
  })

  it('o texto padrão anterior (intacto) e o ainda mais antigo passam para o novo', () => {
    expect(aplicar(lista, { categoria: 'orcamento_enviado', conteudo: padraoAnterior.novo })).toBe(padraoDaVersao)
    expect(aplicar(lista, { categoria: 'orcamento_enviado', conteudo: padraoAnterior.antigo })).toBe(padraoDaVersao)
  })

  it('template editado fica como está', () => {
    const editado = padraoAnterior.novo.replace('Veja os detalhes e aprove aqui:', 'Aprove aqui:')
    expect(aplicar(lista, { categoria: 'orcamento_enviado', conteudo: editado })).toBe(editado)
  })

  it('o texto da versão traz o pagamento e a aprovação como na arte', () => {
    expect(padraoDaVersao).toContain('Pagamento: {{condicoes_pagamento}}')
    expect(padraoDaVersao).toContain('Responda *APROVADO* aqui mesmo ou peça o ajuste que precisar.\n\n— {{empresa_nome}}\n\nSe preferir, veja e aprove pelo link:\n{{link_aprovacao}}')
  })
})

describe('migration 20261027100000_whatsapp_respostas', () => {
  const lista = trocas('20261027100000_whatsapp_respostas')
  const anteriores = [...trocas('20261025100000_orcamento_pagamento'), ...trocas('20261020100000_mensagens_whatsapp_formatadas')].filter((v) => v.categoria === 'orcamento_enviado')

  it('só mexe no orçamento e troca para o texto padrão de agora (com a enquete), byte a byte', () => {
    expect(lista.length).toBe(3)
    for (const v of lista) {
      expect(v.categoria).toBe('orcamento_enviado')
      expect(v.novo).toBe(TEXTOS_PADRAO_MENSAGEM.orcamento_enviado)
    }
    expect(TEXTOS_PADRAO_MENSAGEM.orcamento_enviado).toContain('Válido até *{{validade}}*\n\nToque em uma opção logo abaixo ou responda *APROVADO* aqui mesmo.\n\n— {{empresa_nome}}')
  })

  it('o padrão anterior e os mais antigos (intactos) passam para o novo; só muda a linha da aprovação', () => {
    for (const v of anteriores) {
      expect(aplicar(lista, { categoria: 'orcamento_enviado', conteudo: v.novo })).toBe(TEXTOS_PADRAO_MENSAGEM.orcamento_enviado)
      expect(aplicar(lista, { categoria: 'orcamento_enviado', conteudo: v.antigo })).toBe(TEXTOS_PADRAO_MENSAGEM.orcamento_enviado)
    }
    expect(lista[0]!.antigo.replace('Responda *APROVADO* aqui mesmo ou peça o ajuste que precisar.', 'Toque em uma opção logo abaixo ou responda *APROVADO* aqui mesmo.')).toBe(
      TEXTOS_PADRAO_MENSAGEM.orcamento_enviado,
    )
  })

  it('template editado (ou de outra categoria) fica como está', () => {
    const editado = lista[0]!.antigo.replace('Se preferir', 'Ou, se preferir')
    expect(aplicar(lista, { categoria: 'orcamento_enviado', conteudo: editado })).toBe(editado)
    expect(aplicar(lista, { categoria: 'arte_aprovacao', conteudo: lista[0]!.antigo })).toBe(lista[0]!.antigo)
  })
})
