import { nomeCliente, type Orcamento, type OrcamentoDetalhe } from '@onprint/shared'
import { orcamentosApi } from '@/api/comercial'

/** Aviso depois de "Registrar aprovação": com a conversão automática ligada, já diz o pedido criado */
export function avisoAprovacao(r: Pick<OrcamentoDetalhe, 'status' | 'pedido'>) {
  return r.status === 'convertido' && r.pedido ? `Aprovação registrada · virou o pedido ${r.pedido.numero}.` : 'Aprovação registrada.'
}

/** "Cliente aprovou pelo WhatsApp": só para orçamento já enviado (a mensagem pede para responder APROVADO) */
export const podeAprovarPeloWhatsapp = (status: string) => status === 'enviado' || status === 'em_negociacao'

/**
 * Um clique: registra a aprovação em nome do cliente (nome de exibição), com o canal WhatsApp. A conversão em
 * pedido segue a configuração da empresa, com o pagamento combinado no orçamento.
 */
export function aprovarPeloWhatsapp(o: Pick<Orcamento, 'id' | 'cliente'>) {
  return orcamentosApi.aprovar(o.id, nomeCliente(o.cliente), 'whatsapp')
}
