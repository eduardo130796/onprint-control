import type { CategoriaTemplate } from '@onprint/shared'

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
    conteudo: 'Olá, {{cliente_nome}}! Seu pedido está pronto. Previsão de entrega/retirada: {{data_entrega}}.',
  },
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
