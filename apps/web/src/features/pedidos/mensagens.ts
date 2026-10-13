import {
  formaEntregaPronto,
  formatarDataSimples,
  formatarMoeda,
  inserirAntesDoFim,
  nomeCliente,
  nomeParaSaudacao,
  preencherMensagem,
  valorEmAberto,
  type MensagemTemplate,
  type PedidoDetalhe,
  type VariavelTemplate,
} from '@onprint/shared'
import { textoDoTemplate } from '@/features/whatsapp/previa'
import { linkAcompanhamento, linkPublico } from '@/lib/empresaAtual'

export function linkArte(token: string): string {
  return linkPublico('arte', token)
}

/** Variáveis do pedido comuns às mensagens (mesmas da API nos avisos automáticos) */
function valoresDoPedido(pedido: PedidoDetalhe, empresa: string): Partial<Record<VariavelTemplate, string>> {
  return {
    cliente_nome: nomeParaSaudacao(nomeCliente(pedido.cliente), pedido.cliente.cpfCnpj),
    numero_pedido: pedido.numero,
    link_acompanhamento: linkAcompanhamento(pedido.tokenPublico),
    valor_total: formatarMoeda(pedido.total),
    valor_em_aberto: valorEmAberto(pedido.total, pedido.valorPago),
    data_entrega: formatarDataSimples(pedido.dataPrevistaEntrega),
    forma_entrega: formaEntregaPronto(pedido.tipoEntrega),
    empresa_nome: empresa,
  }
}

/** Link de aprovação da arte de um item (template "Arte para aprovação") */
export function mensagemDaArte(pedido: PedidoDetalhe, arte: { token: string; item: string }, templates: MensagemTemplate[] | undefined, empresa: string): string {
  return preencherMensagem(textoDoTemplate('arte_aprovacao', templates), {
    ...valoresDoPedido(pedido, empresa),
    descricao_item: arte.item,
    link_aprovacao: linkArte(arte.token),
  })
}

/** Pedido pronto: retirada ou entrega e o que falta pagar (template "Pedido pronto") */
export function mensagemPedidoPronto(pedido: PedidoDetalhe, templates: MensagemTemplate[] | undefined, empresa: string): string {
  return preencherMensagem(textoDoTemplate('pedido_pronto', templates), valoresDoPedido(pedido, empresa))
}

/** Link "Acompanhe seu pedido" (template "Acompanhamento do pedido") */
export function mensagemAcompanhamento(pedido: PedidoDetalhe, templates: MensagemTemplate[] | undefined, empresa: string): string {
  return preencherMensagem(textoDoTemplate('pedido_acompanhamento', templates), valoresDoPedido(pedido, empresa))
}

/** Recibo dos pagamentos escolhidos; com o PDF anexado, avisa que ele vai logo abaixo */
export function mensagemRecibo(pedido: PedidoDetalhe, valorRecebido: string | number, empresa: string, comPdf: boolean): string {
  const v = valoresDoPedido(pedido, empresa)
  const texto = [
    `Olá, ${v.cliente_nome || ''}!`.replace(/^Olá, !/, 'Olá!'),
    '',
    `Recebemos *${formatarMoeda(valorRecebido)}* do pedido *${pedido.numero}* ✅`,
    v.valor_em_aberto ? `Valor em aberto: *${v.valor_em_aberto}*` : 'Pedido quitado. Obrigado!',
    '',
    `— ${empresa}`,
    '',
    'Acompanhe o pedido aqui:',
    v.link_acompanhamento!,
  ].join('\n')
  return comPdf ? inserirAntesDoFim(texto, 'O recibo em PDF vai logo abaixo.') : texto
}
