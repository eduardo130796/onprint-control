import { TEXTOS_PADRAO_WHATSAPP, type CategoriaTemplate } from '@onprint/shared'

export { STATUS_PADRAO } from '@onprint/shared'

export const TEMPLATES_PADRAO: { nome: string; categoria: CategoriaTemplate; conteudo: string }[] = [
  {
    nome: 'Orçamento enviado',
    categoria: 'orcamento_enviado',
    conteudo:
      'Olá, {{cliente_nome}}! Segue o orçamento {{numero_orcamento}} no valor de {{valor_total}}.\n' +
      'Para ver os detalhes e aprovar, acesse: {{link_aprovacao}}\nQualquer dúvida, estamos à disposição!',
  },
  {
    nome: 'Arte para aprovação',
    categoria: 'arte_aprovacao',
    conteudo:
      'Olá, {{cliente_nome}}! A arte do seu pedido está pronta para aprovação.\n' +
      'Confira e aprove pelo link: {{link_aprovacao}}',
  },
  {
    nome: 'Pedido pronto',
    categoria: 'pedido_pronto',
    conteudo:
      'Olá, {{cliente_nome}}! Seu pedido {{numero_pedido}} está pronto. Previsão de entrega/retirada: {{data_entrega}}.\n' +
      'Detalhes e andamento: {{link_acompanhamento}}',
  },
  {
    nome: 'Acompanhamento do pedido',
    categoria: 'pedido_acompanhamento',
    // Mesmo texto da migration 20261019100000_pedido_token_publico (empresas que já existiam)
    conteudo:
      'Olá, {{cliente_nome}}! Acompanhe o andamento do seu pedido {{numero_pedido}} por este link: {{link_acompanhamento}}\n' +
      'Previsão de entrega: {{data_entrega}}.',
  },
  // Avisos automáticos pelo WhatsApp (empresas que já existiam: migration 20261019110000_whatsapp_avisos)
  { nome: 'Pedido confirmado', categoria: 'pedido_confirmado', conteudo: TEXTOS_PADRAO_WHATSAPP.pedido_confirmado },
  { nome: 'Pedido saiu para entrega', categoria: 'pedido_em_entrega', conteudo: TEXTOS_PADRAO_WHATSAPP.pedido_em_entrega },
  { nome: 'Pedido entregue', categoria: 'pedido_entregue', conteudo: TEXTOS_PADRAO_WHATSAPP.pedido_entregue },
  { nome: 'Pagamento recebido', categoria: 'pagamento_recebido', conteudo: TEXTOS_PADRAO_WHATSAPP.pagamento_recebido },
  {
    nome: 'Cobrança',
    categoria: 'cobranca',
    conteudo:
      'Olá, {{cliente_nome}}! Lembramos que há um valor em aberto de {{valor_total}}. ' +
      'Se já efetuou o pagamento, por favor desconsidere.',
  },
  {
    nome: 'Boas-vindas',
    categoria: 'boas_vindas',
    conteudo: 'Olá, {{cliente_nome}}! Obrigado pelo contato. Em que podemos ajudar?',
  },
]
