import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { Decimal, regraDoPreset, regraComercialSchema, type ItemParaRegras } from '@onprint/shared'
import { instrucoesDoDono, MAX_MANUAL_NO_PROMPT } from '../src/modules/assistente/prompts'
import { pedidoOrcamentoDeTexto } from '../src/modules/assistente/prompts-equipe'
import { comAjusteDasRegras } from '../src/modules/orcamentos/analise'
import { aplicarRegrasNoCalculo, carregarRegras, totalDoOrcamento, type Recalculo } from '../src/modules/orcamentos/calculo'
import { itemNoPedido, noPedido } from '../src/modules/orcamentos/conversao.service'
import { aceitasParaGravar, liberacaoDoOrcamento, origemDoOrcamento } from '../src/modules/orcamentos/orcamentos.service'

/** Linha do banco como a tabela regras_comerciais guarda (JSON validado na gravação) */
function linha(id: string, prioridade: number, preset: Parameters<typeof regraDoPreset>[0], ajuste: Record<string, unknown> = {}) {
  const r = regraComercialSchema.parse({ ...regraDoPreset(preset), ...ajuste })
  // Sem modo dito: "sempre" (o comportamento destes testes); os do modo de uso passam o modoUso
  return { id, prioridade, nome: r.nome, ativa: r.ativa, tipo: r.tipo, condicoes: r.condicoes, acao: r.acao, combinacao: r.combinacao, modoUso: (ajuste.modoUso as string | undefined) ?? 'sempre' }
}

function banco(linhas: ReturnType<typeof linha>[], tags: string[] = []) {
  return {
    regraComercial: { findMany: vi.fn(async ({ where }: { where: { ativa?: boolean } }) => linhas.filter((l) => where.ativa === undefined || l.ativa === where.ativa)) },
    cliente: { findUnique: vi.fn(async () => ({ tags })) },
  } as unknown as PrismaClient
}

/** Recálculo de um item por unidade (como recalcularItens devolve) */
function recalculo(quantidade: string, preco: string, desconto = '0'): Recalculo {
  const bruto = new Decimal(quantidade).mul(preco).toFixed(2)
  const paraRegras: ItemParaRegras = {
    produtoId: 'p1',
    categoriaId: null,
    descricao: 'Cartão',
    quantidade,
    quantidadeCobrada: quantidade,
    precoUnitario: preco,
    precoCatalogo: preco,
    valorProduto: bruto,
    valorAcabamentos: '0.00',
    desconto,
    unidade: 'un',
  }
  return {
    itens: [{ total: new Decimal(bruto).minus(desconto).toFixed(2), desconto, ajusteRegras: '0.00' } as Recalculo['itens'][number]],
    subtotal: new Decimal(bruto).minus(desconto).toFixed(2),
    custoEstimado: '0.00',
    prazoDias: 0,
    parametros: {} as Recalculo['parametros'],
    lucrosMinimos: [null],
    paraRegras: [paraRegras],
  }
}

const contexto = { clienteId: 'c1', pagamento: { sinalPercentual: '50', parcelas: 1 }, dataDesejada: null, origem: 'balcao' as const, desconto: '0', acrescimo: '0', frete: '0', hoje: '2026-10-26' }

describe('regras no cálculo do orçamento (API)', () => {
  it('carrega só as ativas, na ordem, e deixa de fora JSON inválido', async () => {
    const db = banco([linha('a', 2, 'desconto_quantidade'), { ...linha('b', 1, 'pedido_minimo'), acao: { tipo: 'inventado' } as never }, { ...linha('c', 3, 'urgencia'), ativa: false }])
    const regras = await carregarRegras(db)
    expect(regras.map((r) => r.id)).toEqual(['a'])
  })

  it('aplica no item (ajuste e total) e no orçamento (ajuste à parte), com quantidades ≥ 1000', async () => {
    const db = banco([
      linha('qtd', 1, 'desconto_quantidade', { acao: { tipo: 'desconto', modo: 'percentual', valor: '5', nivel: 'item', faixasPor: 'quantidade', faixas: [{ minimo: '1000', valor: '5' }] } }),
      linha('rev', 2, 'cliente_especial'),
    ], ['Revenda'])
    const { calculo, regras } = await aplicarRegrasNoCalculo(db, recalculo('1500', '0.40'), contexto)
    // 600 − 5% − 10% = 510
    expect(calculo.itens[0]!.ajusteRegras).toBe('-90.00')
    expect(calculo.itens[0]!.total).toBe('510.00')
    expect(calculo.subtotal).toBe('510.00')
    expect(regras.aplicadas.map((a) => a.explicacao)).toEqual(['Desconto por quantidade (−5%)', 'Cliente revenda (−10%)'])
  })

  it('pedido mínimo e desconto à vista entram no ajuste do orçamento; o total fecha', async () => {
    const db = banco([linha('min', 1, 'pedido_minimo'), linha('pix', 2, 'desconto_a_vista')])
    const aVista = { ...contexto, pagamento: { sinalPercentual: '100', parcelas: 0 }, frete: '10' }
    const { calculo, regras } = await aplicarRegrasNoCalculo(db, recalculo('1', '40'), aVista)
    // 40 − 3% (1,20) = 38,80 → completa até 50 (+11,20): ajuste = +10,00
    expect(regras.ajusteOrcamento).toBe('10.00')
    expect(totalDoOrcamento(calculo.subtotal, '0', '0', '10', regras.ajusteOrcamento)).toBe('60.00')
    expect(regras.total).toBe('60.00')
  })

  it('sem regras, nada muda (orçamentos e empresas sem regra continuam iguais)', async () => {
    const { calculo, regras } = await aplicarRegrasNoCalculo(banco([]), recalculo('1000', '0.45', '10'), contexto)
    expect(calculo.itens[0]!.total).toBe('440.00')
    expect(regras.ajusteOrcamento).toBe('0.00')
    expect(regras.aplicadas).toEqual([])
  })

  it('total nunca negativo', () => {
    expect(() => totalDoOrcamento('10.00', '20.00', '0', '0')).toThrow()
    expect(totalDoOrcamento('10.00', '0', '0', '0', '-2.50')).toBe('7.50')
  })
})

describe('liberação do gerente', () => {
  const pede = { aprovacoes: [{ regraId: 'r', motivo: 'Desconto manual de 8% passa do limite de negociação (5%).' }], bloqueios: [] }
  const vendedor = { usuarioId: 'v', podeAprovar: false }
  const gerente = { usuarioId: 'g', podeAprovar: true }

  it('sem motivo: nada pendente', () => {
    expect(liberacaoDoOrcamento({ aprovacoes: [], bloqueios: [] }, '100.00', vendedor)).toMatchObject({ liberacaoPendente: false, liberacaoChave: null })
  })

  it('vendedor: fica pendente; gerente salvando: já libera', () => {
    expect(liberacaoDoOrcamento(pede, '100.00', vendedor).liberacaoPendente).toBe(true)
    const g = liberacaoDoOrcamento(pede, '100.00', gerente)
    expect(g).toMatchObject({ liberacaoPendente: false, liberadoPorId: 'g' })
  })

  it('liberado continua liberado se nada mudou; mudou o total ou o motivo, pede de novo', () => {
    const pendente = liberacaoDoOrcamento(pede, '100.00', vendedor)
    const liberado = { liberacaoChave: pendente.liberacaoChave, liberadoPorId: 'g', liberadoEm: new Date() }
    expect(liberacaoDoOrcamento(pede, '100.00', vendedor, liberado).liberacaoPendente).toBe(false)
    expect(liberacaoDoOrcamento(pede, '99.00', vendedor, liberado).liberacaoPendente).toBe(true)
  })

  it('bloqueio: nem o gerente libera só salvando (precisa do clique em "Liberar")', () => {
    expect(liberacaoDoOrcamento({ aprovacoes: [], bloqueios: [{ regraId: 'b', motivo: 'Fachada: sem visita técnica' }] }, '100.00', gerente).liberacaoPendente).toBe(true)
  })
})

describe('origem e pedido', () => {
  it('origem do orçamento novo', () => {
    expect(origemDoOrcamento(undefined, null)).toBe('balcao')
    expect(origemDoOrcamento('assistente', 'site')).toBe('assistente')
    expect(origemDoOrcamento(undefined, 'site')).toBe('vitrine')
    expect(origemDoOrcamento('balcao', 'whatsapp')).toBe('whatsapp')
    expect(origemDoOrcamento(undefined, 'telefone')).toBe('balcao')
  })

  it('no pedido, o ajuste das regras vira desconto ou acréscimo (o total fecha igual)', () => {
    expect(noPedido('5.00', '0', '-12.30')).toEqual({ desconto: '17.30', acrescimo: '0.00' })
    expect(noPedido('0', '2.00', '20.00')).toEqual({ desconto: '0.00', acrescimo: '22.00' })
    expect(noPedido('1', '1', undefined)).toEqual({ desconto: '1.00', acrescimo: '1.00' })
    expect(itemNoPedido('450.00', '0', '-22.50')).toEqual({ valorProduto: '450.00', desconto: '22.50' })
    expect(itemNoPedido('450.00', '10', '45.00')).toEqual({ valorProduto: '495.00', desconto: '10.00' })
  })

  it('lucro do orçamento salvo: o ajuste das regras soma no desconto ou no acréscimo', () => {
    expect(comAjusteDasRegras({ desconto: '5', acrescimo: '1', ajusteRegras: '-3' })).toEqual({ desconto: '8.00', acrescimo: '1.00' })
    expect(comAjusteDasRegras({ desconto: '0', acrescimo: '0', ajusteRegras: '12.5' })).toEqual({ desconto: '0.00', acrescimo: '12.50' })
  })
})

describe('manual do atendente no Assistente', () => {
  const catalogo = [{ id: 'p1', nome: 'Cartão de visita', codigo: 'CV', categoria: 'Cartões', modoCalculo: 'milheiro' as const, precisaArte: true, larguraPadrao: null, alturaPadrao: null, larguraMaxima: null, alturaMaxima: null, acabamentos: [] }]

  it('vai como instruções do dono, depois das regras do sistema, sem dados pessoais e com limite de tamanho', () => {
    const p = pedidoOrcamentoDeTexto({ grafica: 'Ponto Visual', pedido: '500 cartões', catalogo, manual: 'Sempre oferecer a criação de arte. Dúvidas: (11) 98888-7777' })
    expect(p.sistema).toContain('<manual_do_atendente>\nSempre oferecer a criação de arte.')
    expect(p.sistema).toContain('nunca mudam preço')
    expect(p.sistema).not.toContain('98888')
    expect(p.sistema.indexOf('manual_do_atendente')).toBeGreaterThan(p.sistema.indexOf('<pedido_do_cliente>'))
    expect(instrucoesDoDono('x'.repeat(5000)).length).toBeLessThan(MAX_MANUAL_NO_PROMPT + 600)
  })

  it('sem manual, nada no prompt', () => {
    expect(instrucoesDoDono(null)).toBe('')
    expect(instrucoesDoDono('   ')).toBe('')
    expect(pedidoOrcamentoDeTexto({ grafica: 'G', pedido: '500 cartões', catalogo }).sistema).not.toContain('manual_do_atendente')
  })

  it('as sugestões do modelo voltam limpas (até 5) e são só sugestões', () => {
    const p = pedidoOrcamentoDeTexto({ grafica: 'G', pedido: '500 cartões', catalogo, manual: 'Sempre oferecer a criação de arte.' })
    const v = p.validar({
      itens: [{ produto: 'P1', descricao: '500 cartões', quantidade: 500, largura_m: null, altura_m: null, acabamentos: [], observacao: null, confianca: 0.9, motivo: 'cartão' }],
      cliente_nome: null,
      prazo_desejado: null,
      observacoes: null,
      nao_identificados: [],
      sugestoes: ['Oferecer a criação da arte', '  ', 'a', 'b', 'c', 'd', 'e'],
    })
    expect(v.sugestoes).toEqual(['Oferecer a criação da arte', 'a', 'b', 'c', 'd'])
    expect(v.itens).toHaveLength(1)
    // Resposta sem o campo (esquema anterior): nenhuma sugestão
    expect(p.validar({ itens: [], cliente_nome: null, prazo_desejado: null, observacoes: null, nao_identificados: [] }).sugestoes).toEqual([])
  })
})

describe('modo de uso das regras (API)', () => {
  it('carrega o modo gravado; desconto sem modo válido = sugerir; acréscimo = sempre', async () => {
    const db = banco([
      { ...linha('a', 1, 'desconto_quantidade'), modoUso: 'se_pedir' },
      { ...linha('b', 2, 'desconto_a_vista'), modoUso: 'qualquer' },
      { ...linha('c', 3, 'urgencia'), modoUso: 'sugerir' },
    ])
    expect((await carregarRegras(db)).map((r) => [r.id, r.modoUso])).toEqual([
      ['a', 'se_pedir'],
      ['b', 'sugerir'],
      ['c', 'sempre'],
    ])
  })

  it('sugerida não entra no salvamento até o vendedor aplicar; aplicada fica gravada e vale ao recalcular', async () => {
    const regra = linha('11111111-1111-4111-8111-111111111111', 1, 'desconto_quantidade', { modoUso: 'sugerir' })
    const db = banco([regra])
    const sem = await aplicarRegrasNoCalculo(db, recalculo('1000', '0.20'), contexto)
    expect(sem.regras.ajusteOrcamento).toBe('0.00')
    expect(sem.calculo.subtotal).toBe('200.00')
    expect(sem.regras.ofertas).toMatchObject([{ regraId: regra.id, modo: 'sugerir', valor: '20.00', texto: '10% por quantidade' }])
    const aceitas = aceitasParaGravar([regra.id, regra.id], undefined)
    expect(aceitas).toEqual([regra.id])
    const com = await aplicarRegrasNoCalculo(db, recalculo('1000', '0.20'), { ...contexto, aceitas })
    expect(com.calculo.subtotal).toBe('180.00')
    expect(com.regras.aceitas).toEqual([regra.id])
    // Salvar de novo sem mandar o campo (outra tela, duplicar): o que estava gravado continua
    expect(aceitasParaGravar(undefined, [regra.id])).toEqual([regra.id])
    expect(aceitasParaGravar([], [regra.id])).toEqual([])
  })

  it('migration: descontos existentes viram "sugerir" e os já aplicados nos orçamentos contam como aceitos', () => {
    const sql = readFileSync(join(__dirname, '../prisma/migrations/20261102100000_regras_modo_uso/migration.sql'), 'utf8')
    expect(sql).toMatch(/ADD COLUMN "modo_uso" TEXT NOT NULL DEFAULT 'sempre'/)
    expect(sql).toMatch(/SET "modo_uso" = 'sugerir'\s+WHERE "acao"->>'tipo' IN \('desconto', 'preco_especial'\)/)
    expect(sql).toMatch(/ADD COLUMN "regras_aceitas" TEXT\[\] NOT NULL DEFAULT ARRAY\[\]::TEXT\[\]/)
    expect(sql).not.toMatch(/DROP|TRUNCATE|DELETE/i)
  })
})
