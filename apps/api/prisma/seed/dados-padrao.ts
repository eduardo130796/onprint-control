import { TEXTOS_PADRAO_MENSAGEM as T, type CategoriaTemplate } from '@onprint/shared'

export { STATUS_PADRAO } from '@onprint/shared'

/**
 * Mensagens prontas de uma empresa nova. Os textos (padrão WhatsApp: saudação, blocos, *negrito*, link no fim)
 * ficam em @onprint/shared; empresas antigas com o texto anterior intacto recebem os novos pela migration
 * 20261020100000_mensagens_whatsapp_formatadas.
 */
export const TEMPLATES_PADRAO: { nome: string; categoria: CategoriaTemplate; conteudo: string }[] = [
  { nome: 'Orçamento enviado', categoria: 'orcamento_enviado', conteudo: T.orcamento_enviado },
  { nome: 'Arte para aprovação', categoria: 'arte_aprovacao', conteudo: T.arte_aprovacao },
  { nome: 'Pedido pronto', categoria: 'pedido_pronto', conteudo: T.pedido_pronto },
  { nome: 'Acompanhamento do pedido', categoria: 'pedido_acompanhamento', conteudo: T.pedido_acompanhamento },
  // Avisos automáticos pelo WhatsApp
  { nome: 'Pedido confirmado', categoria: 'pedido_confirmado', conteudo: T.pedido_confirmado },
  { nome: 'Pedido saiu para entrega', categoria: 'pedido_em_entrega', conteudo: T.pedido_em_entrega },
  { nome: 'Pedido entregue', categoria: 'pedido_entregue', conteudo: T.pedido_entregue },
  { nome: 'Pagamento recebido', categoria: 'pagamento_recebido', conteudo: T.pagamento_recebido },
  { nome: 'Cobrança', categoria: 'cobranca', conteudo: T.cobranca },
  { nome: 'Boas-vindas', categoria: 'boas_vindas', conteudo: T.boas_vindas },
]
