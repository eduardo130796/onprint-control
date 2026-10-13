import type { OrcamentoDetalhe } from '@onprint/shared'

/** Aviso depois de "Registrar aprovação": com a conversão automática ligada, já diz o pedido criado */
export function avisoAprovacao(r: Pick<OrcamentoDetalhe, 'status' | 'pedido'>) {
  return r.status === 'convertido' && r.pedido ? `Aprovação registrada · virou o pedido ${r.pedido.numero}.` : 'Aprovação registrada.'
}
