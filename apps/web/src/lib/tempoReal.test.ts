import { describe, expect, it } from 'vitest'
import type { EventoOrcamento, EventoSolicitacao } from '@onprint/shared'
import { avisoDaNotificacao, avisoDaSolicitacao, avisoDoOrcamento, chavesDoEvento } from './tempoReal'

const aprovadoPeloCliente: EventoOrcamento = {
  id: 'o1',
  numero: 'ORC-2026-0007',
  status: 'convertido',
  acao: 'convertido',
  origem: 'cliente',
  atorId: null,
  vendedorId: 'v1',
  cliente: 'Pet Feliz',
  pedidoId: 'p1',
  pedidoNumero: 'PED-2026-0003',
}
const vendedor = { usuarioId: 'v1', veTodosOrcamentos: false }
const gerente = { usuarioId: 'g1', veTodosOrcamentos: true }
const outroVendedor = { usuarioId: 'v2', veTodosOrcamentos: false }

describe('Tempo real: aviso de orçamento', () => {
  it('cliente aprovou e virou pedido: aviso com o botão "Abrir pedido"', () => {
    expect(avisoDoOrcamento(aprovadoPeloCliente, vendedor)).toEqual({
      mensagem: 'Pet Feliz aprovou o orçamento ORC-2026-0007 · virou o pedido PED-2026-0003',
      acao: { rotulo: 'Abrir pedido', link: '/pedidos/p1' },
    })
  })
  it('aprovado sem conversão (configuração desligada): abre o orçamento', () => {
    const e = { ...aprovadoPeloCliente, status: 'aprovado' as const, acao: 'aprovado' as const, pedidoId: null, pedidoNumero: null }
    expect(avisoDoOrcamento(e, gerente)).toEqual({ mensagem: 'Pet Feliz aprovou o orçamento ORC-2026-0007', acao: { rotulo: 'Abrir orçamento', link: '/orcamentos/o1' } })
  })
  it('cliente recusou', () => {
    expect(avisoDoOrcamento({ ...aprovadoPeloCliente, acao: 'recusado', status: 'recusado' }, vendedor)?.mensagem).toBe('Pet Feliz recusou o orçamento ORC-2026-0007')
  })
  it('sem "ver todos", o orçamento de outro vendedor não gera aviso', () => {
    expect(avisoDoOrcamento(aprovadoPeloCliente, outroVendedor)).toBeNull()
  })
  it('quem fez a ação não recebe aviso (a própria tela já mostrou)', () => {
    const minha = { ...aprovadoPeloCliente, origem: 'equipe' as const, atorId: 'v1' }
    expect(avisoDoOrcamento(minha, vendedor)).toBeNull()
  })
  it('colega registrou a aprovação do meu orçamento: aviso para mim, não para o gerente', () => {
    const colega = { ...aprovadoPeloCliente, acao: 'aprovado' as const, origem: 'equipe' as const, atorId: 'v2' }
    expect(avisoDoOrcamento(colega, vendedor)?.mensagem).toBe('Aprovação do orçamento ORC-2026-0007 registrada · virou o pedido PED-2026-0003')
    expect(avisoDoOrcamento(colega, gerente)).toBeNull()
  })
  it('edições, envio e expiração não geram aviso (só atualizam as listas)', () => {
    for (const acao of ['criado', 'alterado', 'enviado', 'negociacao', 'reaberto', 'coluna'] as const) {
      expect(avisoDoOrcamento({ ...aprovadoPeloCliente, acao, origem: 'equipe', atorId: 'v2' }, vendedor)).toBeNull()
    }
    expect(avisoDoOrcamento({ acao: 'expirado', origem: 'sistema', atorId: null }, gerente)).toBeNull()
  })
})

describe('Tempo real: aviso de solicitação', () => {
  const doSite: EventoSolicitacao = { id: 's1', numero: 'SOL-2026-0004', status: 'nova', acao: 'criada', origem: 'cliente', atorId: null, cliente: 'Ana' }
  it('pedido pelo site: aviso com atalho para a solicitação', () => {
    expect(avisoDaSolicitacao('solicitacao:nova', doSite, vendedor)).toEqual({
      mensagem: 'Novo pedido pelo site: SOL-2026-0004 · Ana',
      acao: { rotulo: 'Abrir', link: '/orcamentos/solicitacoes?id=s1' },
    })
  })
  it('criada ou alterada pela equipe: sem aviso', () => {
    expect(avisoDaSolicitacao('solicitacao:nova', { ...doSite, origem: 'equipe', atorId: 'v2' }, vendedor)).toBeNull()
    expect(avisoDaSolicitacao('solicitacao:atualizada', { ...doSite, acao: 'assumida', origem: 'equipe', atorId: 'v2' }, vendedor)).toBeNull()
  })
})

describe('Tempo real: notificação do sino', () => {
  it('com título: aviso (com atalho se tiver link)', () => {
    expect(avisoDaNotificacao({ titulo: 'Pedido PED-1 pronto' })).toEqual({ mensagem: 'Pedido PED-1 pronto', acao: undefined })
    expect(avisoDaNotificacao({ titulo: 'Arte aprovada', link: '/pedidos/p1' })?.acao).toEqual({ rotulo: 'Abrir', link: '/pedidos/p1' })
  })
  it('toast: false só atualiza o sino (o aviso vem do evento do orçamento/solicitação)', () => {
    expect(avisoDaNotificacao({ titulo: 'Pedido pelo site: SOL-1', toast: false })).toBeNull()
  })
})

describe('Tempo real: listas atualizadas', () => {
  it('conversão atualiza orçamentos, pedidos, financeiro, clientes e o painel', () => {
    expect(chavesDoEvento('orcamento:atualizado', { acao: 'convertido' })).toEqual(expect.arrayContaining(['orcamentos', 'pedidos', 'financeiro', 'clientes', 'dashboard']))
  })
  it('orçamento novo atualiza as solicitações (vira "orçada"); edição comum não mexe em pedidos', () => {
    expect(chavesDoEvento('orcamento:atualizado', { acao: 'criado' })).toContain('solicitacoes')
    expect(chavesDoEvento('orcamento:atualizado', { acao: 'alterado' })).not.toContain('pedidos')
  })
  it('pagamento/caixa (pedido:atualizado) atualiza financeiro e caixa', () => {
    expect(chavesDoEvento('pedido:atualizado')).toEqual(expect.arrayContaining(['pedidos', 'financeiro', 'caixa']))
  })
  it('pedido pelo site atualiza solicitações e clientes (pré-cadastro)', () => {
    expect(chavesDoEvento('solicitacao:nova')).toEqual(expect.arrayContaining(['solicitacoes', 'clientes']))
  })
})
