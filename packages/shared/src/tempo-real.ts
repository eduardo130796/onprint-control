import type { StatusOrcamento, StatusSolicitacao } from './enums-comercial'

/**
 * Eventos de tempo real (Socket.IO, API → telas abertas). As telas só invalidam as queries com eles
 * (os dados vêm sempre da API REST); alguns também viram aviso flutuante para quem não fez a ação.
 */

/** Quem causou a mudança: alguém da equipe, o cliente pelo link/site ou uma tarefa automática */
export type OrigemTempoReal = 'equipe' | 'cliente' | 'sistema'

export type AcaoOrcamentoTempoReal =
  | 'criado'
  | 'alterado'
  | 'enviado'
  | 'negociacao'
  | 'aprovado'
  | 'recusado'
  | 'reaberto'
  | 'convertido'
  | 'expirado'
  | 'coluna'

/** Sala "orcamentos" → `orcamento:atualizado` */
export interface EventoOrcamento {
  /** Ausente quando a mudança pegou vários orçamentos (ex.: expiração diária) */
  id?: string
  numero?: string
  status?: StatusOrcamento
  acao: AcaoOrcamentoTempoReal
  origem: OrigemTempoReal
  /** Usuário que fez a ação (null = cliente ou sistema): a tela de quem fez não mostra aviso */
  atorId: string | null
  /** Vendedor do orçamento: sem "ver todos", o aviso só aparece para ele */
  vendedorId?: string | null
  /** Nome do cliente para o aviso ("Pet Feliz aprovou…") */
  cliente?: string
  pedidoId?: string | null
  pedidoNumero?: string | null
  /** O cliente respondeu na conversa do WhatsApp (enquete ou texto), não pelo link */
  canal?: 'whatsapp'
}

export type AcaoSolicitacaoTempoReal = 'criada' | 'assumida' | 'descartada' | 'orcada'

/** Sala "orcamentos" → `solicitacao:nova` (criada) e `solicitacao:atualizada` (demais) */
export interface EventoSolicitacao {
  id: string
  numero: string
  status: StatusSolicitacao
  acao: AcaoSolicitacaoTempoReal
  origem: OrigemTempoReal
  atorId: string | null
  cliente?: string | null
}
