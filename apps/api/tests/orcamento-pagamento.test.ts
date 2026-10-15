import { describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { Decimal, conversaoSchema, formatarMoeda, resumoCondicoesPagamento } from '@onprint/shared'
import type { ContextoUsuario } from '../src/core/escopo'
import { contasDaConversao, criarConversaoService } from '../src/modules/orcamentos/conversao.service'
import type { OrcamentosService } from '../src/modules/orcamentos/orcamentos.service'

// Só a transação importa aqui: numeração, categoria, OPs e auditoria são de mentira
vi.mock('../src/core/numeracao', () => ({ proximoNumero: vi.fn(async () => 'PED-2026-0099') }))
vi.mock('../src/modules/financeiro/baixa', () => ({ categoriaPorCodigo: vi.fn(async () => 'cat-vendas') }))
vi.mock('../src/modules/producao/geracao', () => ({ gerarOpsDoPedido: vi.fn(async () => undefined) }))
vi.mock('../src/core/auditoria', () => ({ registrarAuditoria: vi.fn(async () => undefined) }))

const plano = (sinalPercentual: string, parcelas: number, intervaloDias = 30) => conversaoSchema.parse({ sinalPercentual, parcelas, intervaloDias })

describe('Contas a receber do pedido = o pagamento que o orçamento prometeu', () => {
  const casos: [string, string, number, number][] = [
    ['900.00', '50', 2, 30],
    ['1234.57', '50', 2, 30],
    ['100.00', '0', 3, 30],
    ['999.99', '33.33', 7, 15],
    ['500.00', '100', 3, 30],
    ['750.00', '40', 0, 30],
  ]
  it.each(casos)('total %s, entrada %s%%, %i parcela(s) a cada %i dias', (total, sinal, parcelas, intervalo) => {
    const contas = contasDaConversao(total, plano(sinal, parcelas, intervalo), '2026-10-15', '2026-10-22')
    const resumo = resumoCondicoesPagamento({ total, sinalPercentual: sinal, parcelas, intervaloDias: intervalo })
    // Soma fecha com o total e cada valor das contas aparece no texto que o cliente viu
    expect(contas.reduce((s, c) => s.plus(c.valor), new Decimal(0)).toFixed(2)).toBe(total)
    const sinalConta = contas.find((c) => c.tipo === 'sinal')
    if (sinalConta && contas.length > 1) expect(resumo).toContain(`Entrada de ${formatarMoeda(sinalConta.valor)}`)
    for (const c of contas.filter((x) => x.tipo === 'parcela')) expect(resumo).toContain(formatarMoeda(c.valor))
  })
  it('50% + 2× a cada 30 dias: entrada hoje e as parcelas em 30 e 60 dias', () => {
    expect(contasDaConversao('900.00', plano('50', 2), '2026-10-15', '2026-10-22').map((c) => [c.tipo, c.valor, c.vencimento])).toEqual([
      ['sinal', '450.00', '2026-10-15'],
      ['parcela', '225.00', '2026-11-14'],
      ['parcela', '225.00', '2026-12-14'],
    ])
  })
  it('parcelas = 0: o restante vence na previsão de entrega', () => {
    expect(contasDaConversao('750.00', plano('40', 0), '2026-10-15', '2026-10-22').map((c) => [c.tipo, c.valor, c.vencimento])).toEqual([
      ['sinal', '300.00', '2026-10-15'],
      ['parcela', '450.00', '2026-10-22'],
    ])
  })
})

/** Orçamento aprovado com dois itens: o produto dos dois "precisa de arte", mas no orçamento só o 1º ficou com arte */
function orcamentoAprovado(itensComArte: boolean[]) {
  return {
    id: 'o1',
    numero: 'ORC-2026-0001',
    status: 'aprovado',
    pedidoId: null,
    clienteId: 'c1',
    vendedorId: null,
    cliente: { situacao: 'ativo' },
    subtotal: '900.00',
    desconto: '0',
    acrescimo: '0',
    frete: '0',
    total: '900.00',
    observacoes: null,
    observacoesInternas: null,
    itens: itensComArte.map((precisaArte, i) => ({
      id: `oi${i}`,
      produtoId: 'p-com-arte',
      descricao: `Item ${i + 1}`,
      quantidade: '1000',
      largura: null,
      altura: null,
      areaM2: '0',
      precoUnitario: '0.45',
      valorProduto: '450.00',
      valorAcabamentos: '0',
      desconto: '0',
      total: '450.00',
      custoEstimado: '0',
      custoDetalhe: null,
      prazoDias: 3,
      ordem: i + 1,
      observacao: null,
      precisaArte,
      acabamentos: [],
    })),
  }
}

function montar(itensComArte: boolean[]) {
  const criar = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'p1', ...data }))
  const tx = { pedido: { create: criar }, orcamento: { updateMany: vi.fn(async () => ({ count: 1 })) }, cliente: { update: vi.fn() }, comissao: { create: vi.fn() } }
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    usuario: { findUnique: vi.fn() },
    clienteEndereco: { findFirst: vi.fn() },
    // O produto diz "precisa de arte": não vale mais, vale o item do orçamento
    produto: { findMany: vi.fn(async () => [{ id: 'p-com-arte', precisaArte: true }]) },
  }
  const app = { prisma, whatsapp: { avisar: vi.fn() } } as unknown as FastifyInstance
  const orcamentos = { obter: vi.fn(async () => orcamentoAprovado(itensComArte)) } as unknown as OrcamentosService
  return { servico: criarConversaoService(app, orcamentos), criar }
}

const ctx: ContextoUsuario = { usuarioId: 'u1', veTodos: true, podeAprovar: true, veCustos: true }
type ItemCriado = { precisaArte: boolean; artes?: unknown }
type DadosPedido = { status: string; itens: { create: ItemCriado[] }; contasReceber: { create: { valor: string; descricao: string }[] } }

describe('Conversão: arte de cada item como decidido no orçamento', () => {
  it('item com arte ganha a arte v1; item sem arte não; pedido aguarda a arte', async () => {
    const { servico, criar } = montar([true, false])
    await servico.converter('o1', plano('50', 2), ctx)
    const data = criar.mock.calls[0]![0].data as unknown as DadosPedido
    expect(data.status).toBe('aguardando_arte')
    expect(data.itens.create.map((i) => [i.precisaArte, Boolean(i.artes)])).toEqual([
      [true, true],
      [false, false],
    ])
    // Contas: entrada + 2 parcelas, como no resumo do orçamento
    expect(data.contasReceber.create.map((c) => [c.descricao, c.valor])).toEqual([
      ['PED-2026-0099 · Sinal', '450.00'],
      ['PED-2026-0099 · Parcela 2/3', '225.00'],
      ['PED-2026-0099 · Parcela 3/3', '225.00'],
    ])
  })
  it('nenhum item com arte: o pedido já nasce em produção (mesmo com o produto marcado)', async () => {
    const { servico, criar } = montar([false, false])
    await servico.converter('o1', plano('100', 0), ctx)
    const data = criar.mock.calls[0]![0].data as unknown as DadosPedido
    expect(data.status).toBe('em_producao')
    expect(data.itens.create.every((i) => !i.precisaArte && !i.artes)).toBe(true)
    expect(data.contasReceber.create.map((c) => [c.descricao, c.valor])).toEqual([['PED-2026-0099 · Sinal', '900.00']])
  })
  it('parcelas = 0: o restante é uma conta "na retirada/entrega"', async () => {
    const { servico, criar } = montar([true])
    await servico.converter('o1', plano('50', 0), ctx)
    const data = criar.mock.calls[0]![0].data as unknown as DadosPedido
    expect(data.contasReceber.create.map((c) => [c.descricao, c.valor])).toEqual([
      ['PED-2026-0099 · Sinal', '450.00'],
      ['PED-2026-0099 · Restante na retirada/entrega', '450.00'],
    ])
  })
})
