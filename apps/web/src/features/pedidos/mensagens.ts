import { formatarDataSimples, preencherTemplate, type MensagemTemplate, type PedidoDetalhe } from '@onprint/shared'
import { linkPublico } from '@/lib/empresaAtual'

export function linkArte(token: string): string {
  return linkPublico('arte', token)
}

const primeiroNome = (nome: string) => nome.split(' ')[0] ?? nome

const PADRAO_ARTE = 'Olá, {{cliente_nome}}! A arte do seu pedido está pronta para aprovação.\nConfira e aprove pelo link: {{link_aprovacao}}'
const PADRAO_PRONTO = 'Olá, {{cliente_nome}}! Seu pedido está pronto. Previsão de entrega/retirada: {{data_entrega}}.'

const template = (templates: MensagemTemplate[] | undefined, categoria: MensagemTemplate['categoria']) =>
  templates?.find((t) => t.categoria === categoria && t.ativo)?.conteudo

/** Texto do WhatsApp com o link de aprovação da arte (template "Arte para aprovação"). */
export function mensagemDaArte(pedido: PedidoDetalhe, token: string, templates: MensagemTemplate[] | undefined): string {
  return preencherTemplate(template(templates, 'arte_aprovacao') ?? PADRAO_ARTE, {
    cliente_nome: primeiroNome(pedido.cliente.nome),
    numero_pedido: pedido.numero,
    link_aprovacao: linkArte(token),
    data_entrega: formatarDataSimples(pedido.dataPrevistaEntrega),
  })
}

/** Texto do WhatsApp avisando que o pedido está pronto (template "Pedido pronto"). */
export function mensagemPedidoPronto(pedido: PedidoDetalhe, templates: MensagemTemplate[] | undefined): string {
  return preencherTemplate(template(templates, 'pedido_pronto') ?? PADRAO_PRONTO, {
    cliente_nome: primeiroNome(pedido.cliente.nome),
    numero_pedido: pedido.numero,
    data_entrega: formatarDataSimples(pedido.dataPrevistaEntrega),
  })
}
