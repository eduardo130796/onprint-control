import { formatarDataSimples, formatarMoeda, nomeCliente, nomeParaSaudacao, preencherTemplate, type MensagemTemplate, type PedidoDetalhe } from '@onprint/shared'
import { linkAcompanhamento, linkPublico } from '@/lib/empresaAtual'

export function linkArte(token: string): string {
  return linkPublico('arte', token)
}

const PADRAO_ARTE = 'Olá, {{cliente_nome}}! A arte do seu pedido está pronta para aprovação.\nConfira e aprove pelo link: {{link_aprovacao}}'
const PADRAO_PRONTO = 'Olá, {{cliente_nome}}! Seu pedido está pronto. Previsão de entrega/retirada: {{data_entrega}}.\nDetalhes e andamento: {{link_acompanhamento}}'
const PADRAO_ACOMPANHAMENTO =
  'Olá, {{cliente_nome}}! Acompanhe o andamento do seu pedido {{numero_pedido}} por este link: {{link_acompanhamento}}\nPrevisão de entrega: {{data_entrega}}.'

const template = (templates: MensagemTemplate[] | undefined, categoria: MensagemTemplate['categoria']) =>
  templates?.find((t) => t.categoria === categoria && t.ativo)?.conteudo

/** Texto do WhatsApp com o link de aprovação da arte (template "Arte para aprovação"). */
export function mensagemDaArte(pedido: PedidoDetalhe, token: string, templates: MensagemTemplate[] | undefined): string {
  return preencherTemplate(template(templates, 'arte_aprovacao') ?? PADRAO_ARTE, {
    cliente_nome: nomeParaSaudacao(nomeCliente(pedido.cliente), pedido.cliente.cpfCnpj),
    numero_pedido: pedido.numero,
    link_aprovacao: linkArte(token),
    link_acompanhamento: linkAcompanhamento(pedido.tokenPublico),
    data_entrega: formatarDataSimples(pedido.dataPrevistaEntrega),
  })
}

/** Texto do WhatsApp avisando que o pedido está pronto (template "Pedido pronto"). */
export function mensagemPedidoPronto(pedido: PedidoDetalhe, templates: MensagemTemplate[] | undefined): string {
  return preencherTemplate(template(templates, 'pedido_pronto') ?? PADRAO_PRONTO, {
    cliente_nome: nomeParaSaudacao(nomeCliente(pedido.cliente), pedido.cliente.cpfCnpj),
    numero_pedido: pedido.numero,
    link_acompanhamento: linkAcompanhamento(pedido.tokenPublico),
    data_entrega: formatarDataSimples(pedido.dataPrevistaEntrega),
  })
}

/** Texto do WhatsApp com o link "Acompanhe seu pedido" (template "Acompanhamento do pedido"). */
export function mensagemAcompanhamento(pedido: PedidoDetalhe, templates: MensagemTemplate[] | undefined): string {
  return preencherTemplate(template(templates, 'pedido_acompanhamento') ?? PADRAO_ACOMPANHAMENTO, {
    cliente_nome: nomeParaSaudacao(nomeCliente(pedido.cliente), pedido.cliente.cpfCnpj),
    numero_pedido: pedido.numero,
    link_acompanhamento: linkAcompanhamento(pedido.tokenPublico),
    valor_total: formatarMoeda(pedido.total),
    data_entrega: formatarDataSimples(pedido.dataPrevistaEntrega),
  })
}
