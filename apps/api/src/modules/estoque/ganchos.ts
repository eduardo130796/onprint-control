import type { FastifyInstance } from 'fastify'
import type { AoCancelarPedido } from '../pedidos/pedidos.service'
import type { AoConcluirOp } from '../producao/ops.service'
import { baixarInsumosDaOp, estornarConsumoDoPedido } from './consumo'
import { avisarAlertas } from './movimentacao'

/** Liga o estoque à produção: baixa de insumos ao concluir a OP (avisa alertas depois do commit). */
export function baixaAoConcluirOp(app: FastifyInstance): AoConcluirOp {
  return async (tx, opId, usuarioId) => {
    const alertas = await baixarInsumosDaOp(tx, opId, usuarioId)
    return () => avisarAlertas(app, alertas)
  }
}

/** Estorno do estoque consumido quando quem cancela o pedido pede a devolução. */
export const estornoAoCancelarPedido: AoCancelarPedido = async (tx, pedido, usuarioId) =>
  pedido.estornarEstoque ? estornarConsumoDoPedido(tx, pedido.id, pedido.numero, usuarioId) : 0
