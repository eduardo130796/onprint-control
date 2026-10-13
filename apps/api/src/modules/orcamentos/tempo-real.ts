import type { FastifyInstance } from 'fastify'
import {
  nomeCliente,
  type AcaoOrcamentoTempoReal,
  type AcaoSolicitacaoTempoReal,
  type EventoOrcamento,
  type EventoSolicitacao,
  type OrigemTempoReal,
  type StatusOrcamento,
  type StatusSolicitacao,
} from '@onprint/shared'

type ClienteNome = { nome: string; fantasia: string | null } | null | undefined

interface OrcamentoAvisado {
  id: string
  numero: string
  status: string
  vendedorId: string | null
  pedidoId: string | null
  cliente?: ClienteNome
  pedido?: { numero: string } | null
}

/** Quem fez e por onde (a tela de quem fez não mostra o aviso flutuante). */
export interface Autoria {
  origem: OrigemTempoReal
  atorId: string | null
}

/** Monta o `orcamento:atualizado` (função pura, testável sem Socket.IO). */
export function eventoOrcamento(o: OrcamentoAvisado, acao: AcaoOrcamentoTempoReal, autoria: Autoria, pedidoNumero?: string | null): EventoOrcamento {
  return {
    id: o.id,
    numero: o.numero,
    status: o.status as StatusOrcamento,
    acao,
    origem: autoria.origem,
    atorId: autoria.atorId,
    vendedorId: o.vendedorId,
    cliente: o.cliente ? nomeCliente(o.cliente) : undefined,
    pedidoId: o.pedidoId,
    pedidoNumero: pedidoNumero ?? o.pedido?.numero ?? null,
  }
}

/** Avisa as telas de orçamentos abertas (sala "orcamentos"). Chamar depois do commit. */
export function avisarOrcamento(app: FastifyInstance, o: OrcamentoAvisado, acao: AcaoOrcamentoTempoReal, autoria: Autoria, pedidoNumero?: string | null) {
  app.tempoReal.emitir('orcamentos', 'orcamento:atualizado', eventoOrcamento(o, acao, autoria, pedidoNumero))
}

interface SolicitacaoAvisada {
  id: string
  numero: string
  status: string
  cliente?: ClienteNome
}

/** Solicitação nova (`solicitacao:nova`) ou alterada (`solicitacao:atualizada`) na sala "orcamentos". */
export function avisarSolicitacao(app: FastifyInstance, s: SolicitacaoAvisada, acao: AcaoSolicitacaoTempoReal, autoria: Autoria) {
  const evento: EventoSolicitacao = {
    id: s.id,
    numero: s.numero,
    status: s.status as StatusSolicitacao,
    acao,
    origem: autoria.origem,
    atorId: autoria.atorId,
    cliente: s.cliente ? nomeCliente(s.cliente) : null,
  }
  app.tempoReal.emitir('orcamentos', acao === 'criada' ? 'solicitacao:nova' : 'solicitacao:atualizada', evento)
}
