import { describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { AppError } from '../src/core/AppError'
import {
  converterAoAprovar,
  criarConversaoAutomatica,
  dadosDaConversaoPadrao,
  type DependenciasConversao,
  type PadroesConversao,
} from '../src/modules/orcamentos/conversao-automatica'
import type { criarConversaoService } from '../src/modules/orcamentos/conversao.service'
import { eventoOrcamento } from '../src/modules/orcamentos/tempo-real'

const END = '7d3c1e0a-5b2f-4c6d-9e8a-1f2b3c4d5e6f'

const padroes: PadroesConversao = {
  converterAoAprovar: true,
  sinalPercentual: '50',
  parcelasPadrao: 2,
  intervaloDiasPadrao: 15,
  tipoEntregaPadrao: 'retirada',
  prioridadePadrao: 'alta',
}

function deps(over: Partial<DependenciasConversao> = {}, p: Partial<PadroesConversao> = {}) {
  return {
    padroes: vi.fn(async () => ({ ...padroes, ...p })),
    orcamento: vi.fn(async () => ({ status: 'aprovado', pedidoId: null as string | null, clienteId: 'c1' })),
    enderecoPrincipal: vi.fn(async () => END as string | null),
    converter: vi.fn(async () => ({ id: 'p1', numero: 'PED-2026-0001' })),
    ...over,
  }
}

describe('Conversão automática: condições pelos padrões da empresa', () => {
  it('sinal, parcelas do saldo, intervalo e prioridade da empresa; retirada sem endereço', () => {
    expect(dadosDaConversaoPadrao(padroes, null)).toMatchObject({
      sinalPercentual: '50',
      parcelas: 2,
      intervaloDias: 15,
      tipoEntrega: 'retirada',
      enderecoEntregaId: null,
      prioridade: 'alta',
    })
  })
  it('entrega com o endereço principal do cliente', () => {
    expect(dadosDaConversaoPadrao({ ...padroes, tipoEntregaPadrao: 'entrega' }, END)).toMatchObject({ tipoEntrega: 'entrega', enderecoEntregaId: END })
  })
  it('entrega ou instalação sem endereço cadastrado: sai como retirada (não trava a conversão)', () => {
    expect(dadosDaConversaoPadrao({ ...padroes, tipoEntregaPadrao: 'instalacao' }, null)).toMatchObject({ tipoEntrega: 'retirada', enderecoEntregaId: null })
  })
})

describe('Conversão automática: quando converte', () => {
  it('ligada: converte com os padrões e devolve o pedido', async () => {
    const d = deps()
    expect(await converterAoAprovar(d, 'o1')).toEqual({ situacao: 'convertido', pedido: { id: 'p1', numero: 'PED-2026-0001' } })
    expect(d.converter).toHaveBeenCalledWith('o1', expect.objectContaining({ parcelas: 2, tipoEntrega: 'retirada' }))
    // Retirada não precisa procurar endereço
    expect(d.enderecoPrincipal).not.toHaveBeenCalled()
  })
  it('padrão "entrega": usa o endereço principal do cliente', async () => {
    const d = deps({}, { tipoEntregaPadrao: 'entrega' })
    await converterAoAprovar(d, 'o1')
    expect(d.enderecoPrincipal).toHaveBeenCalledWith('c1')
    expect(d.converter).toHaveBeenCalledWith('o1', expect.objectContaining({ tipoEntrega: 'entrega', enderecoEntregaId: END }))
  })
  it('desligada: o orçamento fica aprovado e nada é convertido', async () => {
    const d = deps({}, { converterAoAprovar: false })
    expect(await converterAoAprovar(d, 'o1')).toEqual({ situacao: 'desligada' })
    expect(d.converter).not.toHaveBeenCalled()
  })
  it('já convertido ou não mais aprovado: não converte de novo', async () => {
    const convertido = deps({ orcamento: vi.fn(async () => ({ status: 'convertido', pedidoId: 'p0', clienteId: 'c1' })) })
    expect(await converterAoAprovar(convertido, 'o1')).toEqual({ situacao: 'ja_convertido' })
    const reaberto = deps({ orcamento: vi.fn(async () => ({ status: 'em_negociacao', pedidoId: null, clienteId: 'c1' })) })
    expect(await converterAoAprovar(reaberto, 'o1')).toEqual({ situacao: 'ignorado' })
    expect(convertido.converter).not.toHaveBeenCalled()
    expect(reaberto.converter).not.toHaveBeenCalled()
  })
  it('falha na conversão nunca lança: devolve o motivo para a equipe converter à mão', async () => {
    const regra = deps({ converter: vi.fn(async () => Promise.reject(AppError.regraNegocio('Cadastre um endereço do cliente para entrega ou instalação.'))) })
    expect(await converterAoAprovar(regra, 'o1')).toEqual({ situacao: 'falhou', motivo: 'Cadastre um endereço do cliente para entrega ou instalação.' })
    const inesperado = deps({ padroes: vi.fn(async () => Promise.reject(new Error('conexão caiu'))) })
    expect(await converterAoAprovar(inesperado, 'o1')).toEqual({ situacao: 'falhou', motivo: 'erro inesperado ao criar o pedido.' })
  })
  it('idempotente: duas aprovações ao mesmo tempo geram um pedido só', async () => {
    // Banco de mentira: a 2ª conversão bate na transição atômica (status aprovado e sem pedido) e recebe 409
    let pedidoId: string | null = null
    let criados = 0
    const d = deps({
      orcamento: vi.fn(async () => ({ status: 'aprovado', pedidoId: null, clienteId: 'c1' })),
      converter: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 5))
        if (pedidoId) throw AppError.conflito('Este orçamento já foi convertido em pedido.')
        pedidoId = `p${++criados}`
        return { id: pedidoId, numero: 'PED-2026-0001' }
      }),
    })
    const r = await Promise.all([converterAoAprovar(d, 'o1'), converterAoAprovar(d, 'o1')])
    expect(criados).toBe(1)
    expect(r.map((x) => x.situacao).sort()).toEqual(['convertido', 'ja_convertido'])
  })
})

/** App de mentira: só o que a conversão automática usa (prisma, tempo real e log) */
function appFalso(opcoes: { ligada?: boolean } = {}) {
  const emitir = vi.fn()
  const notificacoes: { usuarioId: string; titulo: string; link: string }[] = []
  const prisma = {
    empresaConfig: { findFirst: vi.fn(async () => ({ converterAoAprovar: opcoes.ligada ?? true, sinalPercentual: { toString: () => '50' }, parcelasPadrao: 1, intervaloDiasPadrao: 30, tipoEntregaPadrao: 'retirada', prioridadePadrao: 'normal' })) },
    orcamento: {
      findUnique: vi.fn(async (q: { select: Record<string, unknown> }) =>
        'clienteId' in q.select ? { status: 'aprovado', pedidoId: null, clienteId: 'c1' } : { id: 'o1', numero: 'ORC-2026-0007', status: 'convertido', vendedorId: 'v1', pedidoId: 'p1', pedido: { numero: 'PED-2026-0003' } },
      ),
    },
    clienteEndereco: { findFirst: vi.fn(async () => null) },
    usuario: { findFirst: vi.fn(async () => ({ id: 'adm' })), findMany: vi.fn(async () => [{ id: 'adm' }]) },
    notificacao: { create: vi.fn(async ({ data }: { data: (typeof notificacoes)[number] }) => void notificacoes.push(data)) },
  }
  const app = { prisma, tempoReal: { emitir }, log: { warn: vi.fn(), error: vi.fn() } } as unknown as FastifyInstance
  return { app, emitir, notificacoes }
}

const orcamento = { id: 'o1', numero: 'ORC-2026-0007', vendedorId: 'v1', createdBy: 'v1', cliente: { nome: 'Pet Feliz Comércio Ltda', fantasia: 'Pet Feliz' } }
const doCliente = { origem: 'cliente' as const, atorId: null, nome: 'Ana Souza' }

describe('Conversão automática: depois da aprovação', () => {
  it('aprovação do cliente: pedido criado pelo vendedor (auditoria diz que foi o cliente), vendedor avisado e telas atualizadas', async () => {
    const { app, emitir, notificacoes } = appFalso()
    const converter = vi.fn(async () => ({ id: 'p1', numero: 'PED-2026-0003' }))
    const r = await criarConversaoAutomatica(app, { converter } as unknown as ReturnType<typeof criarConversaoService>).aposAprovacao(orcamento, doCliente)
    expect(r).toEqual({ situacao: 'convertido', pedido: { id: 'p1', numero: 'PED-2026-0003' } })
    expect(converter).toHaveBeenCalledWith('o1', expect.anything(), expect.objectContaining({ usuarioId: 'v1' }), { via: expect.stringContaining('aprovação do cliente') })
    expect(notificacoes).toEqual([
      expect.objectContaining({ usuarioId: 'v1', titulo: 'Orçamento ORC-2026-0007 aprovado pelo cliente · virou o pedido PED-2026-0003', link: '/pedidos/p1' }),
    ])
    expect(emitir).toHaveBeenCalledWith('pedidos', 'pedido:atualizado', { id: 'p1' })
    expect(emitir).toHaveBeenCalledWith(
      'orcamentos',
      'orcamento:atualizado',
      expect.objectContaining({ id: 'o1', acao: 'convertido', origem: 'cliente', atorId: null, cliente: 'Pet Feliz', pedidoId: 'p1', pedidoNumero: 'PED-2026-0003' }),
    )
    // O aviso flutuante vem do evento do orçamento: a notificação só atualiza o sino
    expect(emitir).toHaveBeenCalledWith('usuario:v1', 'notificacao:nova', expect.objectContaining({ toast: false }))
  })

  it('falha na conversão: não lança, avisa vendedor e administradores para converter à mão', async () => {
    const { app, emitir, notificacoes } = appFalso()
    const converter = vi.fn(async () => Promise.reject(AppError.regraNegocio('Cliente bloqueado.')))
    const r = await criarConversaoAutomatica(app, { converter } as unknown as ReturnType<typeof criarConversaoService>).aposAprovacao(orcamento, doCliente)
    expect(r).toEqual({ situacao: 'falhou', motivo: 'Cliente bloqueado.' })
    expect(notificacoes.map((n) => n.usuarioId)).toEqual(['v1', 'adm'])
    expect(notificacoes[0]).toMatchObject({ titulo: 'Orçamento ORC-2026-0007 aprovado — converta em pedido manualmente', link: '/orcamentos/o1' })
    expect(emitir).toHaveBeenCalledWith('usuario:adm', 'notificacao:nova', expect.objectContaining({ toast: true }))
    expect(emitir).not.toHaveBeenCalledWith('pedidos', 'pedido:atualizado', expect.anything())
    expect(app.log.warn).toHaveBeenCalled()
  })

  it('desligada: só avisa a aprovação (sem pedido)', async () => {
    const { app, notificacoes } = appFalso({ ligada: false })
    const converter = vi.fn()
    const r = await criarConversaoAutomatica(app, { converter } as unknown as ReturnType<typeof criarConversaoService>).aposAprovacao(orcamento, doCliente)
    expect(r).toEqual({ situacao: 'desligada' })
    expect(converter).not.toHaveBeenCalled()
    expect(notificacoes).toEqual([expect.objectContaining({ usuarioId: 'v1', titulo: 'Orçamento ORC-2026-0007 aprovado', link: '/orcamentos/o1' })])
  })

  it('registrada pelo próprio vendedor: ele é o autor e não recebe notificação de si mesmo', async () => {
    const { app, notificacoes } = appFalso()
    const converter = vi.fn(async () => ({ id: 'p1', numero: 'PED-2026-0003' }))
    await criarConversaoAutomatica(app, { converter } as unknown as ReturnType<typeof criarConversaoService>).aposAprovacao(orcamento, { origem: 'equipe', atorId: 'v1', nome: 'João' })
    expect(converter).toHaveBeenCalledWith('o1', expect.anything(), expect.objectContaining({ usuarioId: 'v1' }), { via: expect.stringContaining('equipe') })
    expect(notificacoes).toEqual([])
  })
})

describe('Tempo real: evento do orçamento', () => {
  it('leva quem fez, o cliente e o pedido gerado', () => {
    const e = eventoOrcamento(
      { id: 'o1', numero: 'ORC-1', status: 'convertido', vendedorId: 'v1', pedidoId: 'p1', cliente: { nome: 'Pet Feliz Ltda', fantasia: 'Pet Feliz' }, pedido: { numero: 'PED-1' } },
      'convertido',
      { origem: 'equipe', atorId: 'u1' },
    )
    expect(e).toEqual({ id: 'o1', numero: 'ORC-1', status: 'convertido', acao: 'convertido', origem: 'equipe', atorId: 'u1', vendedorId: 'v1', cliente: 'Pet Feliz', pedidoId: 'p1', pedidoNumero: 'PED-1' })
  })
})
