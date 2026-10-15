import {
  formatarDataSimples,
  formatarMoeda,
  inserirAntesDoFim,
  nomeCliente,
  nomeParaSaudacao,
  preencherMensagem,
  valorEmAberto,
  valoresArtesAprovacao,
  type ArteMensagem,
  type MensagemTemplate,
  type PedidoDetalhe,
  type VariavelTemplate,
} from '@onprint/shared'
import { textoDoTemplate } from '@/features/whatsapp/previa'
import { linkAcompanhamento } from '@/lib/empresaAtual'

/**
 * Variáveis básicas do pedido para as mensagens montadas aqui (artes e recibo). As mensagens do pedido com tudo no
 * corpo (pronto, acompanhamento...) vêm prontas da API (whatsappApi.mensagemPedido), iguais aos avisos automáticos.
 */
function valoresDoPedido(pedido: PedidoDetalhe, empresa: string): Partial<Record<VariavelTemplate, string>> {
  return {
    cliente_nome: nomeParaSaudacao(nomeCliente(pedido.cliente), pedido.cliente.cpfCnpj),
    numero_pedido: pedido.numero,
    link_acompanhamento: linkAcompanhamento(pedido.tokenPublico),
    valor_total: formatarMoeda(pedido.total),
    valor_em_aberto: valorEmAberto(pedido.total, pedido.valorPago),
    data_entrega: formatarDataSimples(pedido.dataPrevistaEntrega),
    empresa_nome: empresa,
  }
}

/**
 * "Arte para aprovação" (template de mesmo nome): UMA mensagem para o pedido com as artes escolhidas em lista e um
 * link só, o da página do pedido na seção das artes (mesmo texto do aviso automático da API).
 */
export function mensagemDasArtes(pedido: PedidoDetalhe, artes: ArteMensagem[], templates: MensagemTemplate[] | undefined, empresa: string): string {
  const valores = valoresDoPedido(pedido, empresa)
  return preencherMensagem(textoDoTemplate('arte_aprovacao', templates), { ...valores, ...valoresArtesAprovacao(artes, valores.link_acompanhamento ?? '') })
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
