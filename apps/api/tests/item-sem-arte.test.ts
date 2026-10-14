import { describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { StatusPedido } from '@onprint/shared'
import { criarArtesService } from '../src/modules/artes/artes.service'
import type { ArquivosService } from '../src/modules/arquivos/service'
import type { ContextoUsuario } from '../src/core/escopo'
import { arteDoItemNaConversao, statusInicialDoPedido } from '../src/modules/orcamentos/conversao.service'

describe('Conversão: o item herda do produto se precisa de arte', () => {
  it('produto com arte: item marcado e arte v1 "aguardando arquivo"', () => {
    expect(arteDoItemNaConversao(true, () => 'tok')).toEqual({
      precisaArte: true,
      artes: { create: { versao: 1, status: 'aguardando_arquivo', tokenPublico: 'tok' } },
    })
  })
  it('produto sem arte: item sem arte e nenhuma versão criada', () => {
    const token = vi.fn(() => 'tok')
    expect(arteDoItemNaConversao(false, token)).toEqual({ precisaArte: false })
    expect(token).not.toHaveBeenCalled()
  })
  it('status inicial: só itens sem arte → em produção; algum com arte → aguardando arte', () => {
    expect(statusInicialDoPedido([false, false])).toBe('em_producao')
    expect(statusInicialDoPedido([false, true])).toBe('aguardando_arte')
    expect(statusInicialDoPedido([true])).toBe('aguardando_arte')
  })
})

/** Banco de mentira: um pedido com dois itens (um ainda com arte aguardando arquivo) */
function montar(opcoes: { precisaArte: boolean; outroPrecisa: boolean; status?: StatusPedido; artesDoItem?: number }) {
  const estado = {
    status: opcoes.status ?? ('aguardando_arte' as StatusPedido),
    itens: [
      { id: 'i1', precisaArte: opcoes.precisaArte, artes: opcoes.artesDoItem === 0 ? [] : [{ status: 'aguardando_arquivo' }] },
      { id: 'i2', precisaArte: opcoes.outroPrecisa, artes: [{ status: 'aprovada' }] },
    ],
  }
  const artesCriadas: unknown[] = []
  const tx = {
    pedidoItem: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { precisaArte: boolean } }) => {
        estado.itens.find((i) => i.id === where.id)!.precisaArte = data.precisaArte
      }),
    },
    arte: {
      create: vi.fn(async ({ data }: { data: { pedidoItemId: string; status: string } }) => {
        artesCriadas.push(data)
        estado.itens.find((i) => i.id === data.pedidoItemId)!.artes.unshift({ status: data.status })
      }),
    },
    auditoria: { create: vi.fn(async () => ({})) },
    pedido: {
      findUnique: vi.fn(async () => ({
        id: 'p1',
        numero: 'PED-1',
        status: estado.status,
        vendedorId: null,
        tokenPublico: 't',
        cliente: { nome: 'Cliente', fantasia: null, cpfCnpj: null },
        itens: estado.itens.map((i) => ({ precisaArte: i.precisaArte, artes: i.artes.slice(0, 1) })),
        ordensProducao: estado.itens.map((i) => ({ etapaAtual: 'fila', pedidoItem: { precisaArte: i.precisaArte } })),
      })),
      update: vi.fn(async ({ data }: { data: { status: StatusPedido } }) => {
        estado.status = data.status
      }),
    },
  }
  const emitir = vi.fn()
  const avisarStatusPedido = vi.fn(async () => null)
  const app = {
    prisma: {
      pedidoItem: {
        findUnique: vi.fn(async () => {
          const i = estado.itens[0]!
          return { id: i.id, pedidoId: 'p1', descricao: 'Plastificação', precisaArte: i.precisaArte, pedido: { status: estado.status }, _count: { artes: i.artes.length } }
        }),
        // descartarAvisoDeArte: nenhuma arte aguarda o cliente
        findMany: vi.fn(async () => []),
      },
      mensagemWhatsapp: { updateMany: vi.fn(async () => ({ count: 0 })) },
      $transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
    },
    storage: {},
    tempoReal: { emitir },
    whatsapp: { avisarStatusPedido },
  } as unknown as FastifyInstance
  const servico = criarArtesService(app, {} as ArquivosService)
  return { estado, servico, emitir, avisarStatusPedido, tx, artesCriadas, app }
}

const ctx = { usuarioId: 'u1' } as ContextoUsuario

describe('"Este item não precisa de arte": recalcula o status do pedido', () => {
  it('o único item que segurava a arte sai da regra: o pedido vai para a produção e as telas são avisadas', async () => {
    const m = montar({ precisaArte: true, outroPrecisa: true })
    const r = await m.servico.alterarPrecisaArte('i1', false, ctx)
    expect(r.pedido).toMatchObject({ antes: 'aguardando_arte', depois: 'em_producao' })
    expect(m.estado.status).toBe('em_producao')
    expect(m.tx.pedidoItem.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { precisaArte: false } })
    // A arte antiga fica guardada: nada é apagado nem criado
    expect(m.artesCriadas).toEqual([])
    expect(m.emitir).toHaveBeenCalledWith('pedidos', 'pedido:atualizado', { id: 'p1', status: 'em_producao' })
    expect(m.emitir).toHaveBeenCalledWith('producao', 'op:atualizada', { pedidoId: 'p1' })
    // Em produção não gera aviso de WhatsApp (só pronto, em entrega e entregue)
    expect(m.avisarStatusPedido).toHaveBeenCalledWith('p1', 'em_producao')
  })

  it('voltando a precisar de arte, um item que nunca teve arte ganha a v1 e o pedido volta a aguardar a arte', async () => {
    const m = montar({ precisaArte: false, outroPrecisa: false, status: 'em_producao', artesDoItem: 0 })
    const r = await m.servico.alterarPrecisaArte('i1', true, ctx)
    expect(m.artesCriadas).toEqual([expect.objectContaining({ pedidoItemId: 'i1', versao: 1, status: 'aguardando_arquivo' })])
    expect(r.pedido).toMatchObject({ antes: 'em_producao', depois: 'aguardando_arte' })
  })

  it('sem mudança no item: não grava nada', async () => {
    const m = montar({ precisaArte: false, outroPrecisa: true })
    expect(await m.servico.alterarPrecisaArte('i1', false, ctx)).toEqual({ precisaArte: false, pedido: null })
    expect(m.tx.pedidoItem.update).not.toHaveBeenCalled()
  })

  it('pedido encerrado não muda', async () => {
    const m = montar({ precisaArte: true, outroPrecisa: true, status: 'entregue' })
    await expect(m.servico.alterarPrecisaArte('i1', false, ctx)).rejects.toThrow('Pedido encerrado.')
  })
})
