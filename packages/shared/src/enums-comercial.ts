// ─── Comercial, pedidos e financeiro básico ─────────────────────────────────

export const STATUS_SOLICITACAO = ['nova', 'em_atendimento', 'orcada', 'descartada'] as const
export type StatusSolicitacao = (typeof STATUS_SOLICITACAO)[number]

export const STATUS_ORCAMENTO = ['rascunho', 'enviado', 'em_negociacao', 'aprovado', 'recusado', 'expirado', 'convertido'] as const
export type StatusOrcamento = (typeof STATUS_ORCAMENTO)[number]

/** Status em que o orçamento ainda pode ser editado, aprovado ou recusado. */
export const STATUS_ORCAMENTO_ABERTOS: readonly StatusOrcamento[] = ['rascunho', 'enviado', 'em_negociacao']

export const STATUS_PEDIDO = ['aguardando_arte', 'arte_em_aprovacao', 'em_producao', 'pronto', 'em_entrega', 'entregue', 'cancelado'] as const
export type StatusPedido = (typeof STATUS_PEDIDO)[number]

export const STATUS_FINANCEIRO_PEDIDO = ['pendente', 'parcial', 'pago'] as const
export type StatusFinanceiroPedido = (typeof STATUS_FINANCEIRO_PEDIDO)[number]

export const TIPOS_ENTREGA = ['retirada', 'entrega', 'instalacao'] as const
export type TipoEntrega = (typeof TIPOS_ENTREGA)[number]

export const TIPO_ENTREGA_ROTULOS: Record<TipoEntrega, string> = {
  retirada: 'Retirada no balcão',
  entrega: 'Entrega',
  instalacao: 'Instalação',
}

export const PRIORIDADES = ['baixa', 'normal', 'alta', 'urgente'] as const
export type Prioridade = (typeof PRIORIDADES)[number]

export const PRIORIDADE_ROTULOS: Record<Prioridade, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
}

export const STATUS_ARTE = ['aguardando_arquivo', 'em_criacao', 'enviada_cliente', 'ajuste_solicitado', 'aprovada'] as const
export type StatusArte = (typeof STATUS_ARTE)[number]

export const STATUS_CONTA = ['aberto', 'parcial', 'pago', 'vencido', 'cancelado'] as const
export type StatusConta = (typeof STATUS_CONTA)[number]

export const STATUS_COMISSAO = ['prevista', 'liberada', 'paga'] as const
export type StatusComissao = (typeof STATUS_COMISSAO)[number]
