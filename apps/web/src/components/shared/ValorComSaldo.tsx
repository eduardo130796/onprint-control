import { formatarMoeda, saldoPedido } from '@onprint/shared'
import { cn } from '@/lib/utils'

/**
 * Valor de um pedido ou parcela nas listas e cartões. Com pagamento parcial, o destaque é o que falta
 * receber, com o total logo abaixo; quitado, mostra o total marcado como pago.
 */
export function ValorComSaldo({ total, pago, cancelado, className }: { total: string; pago?: string | null; cancelado?: boolean; className?: string }) {
  const s = saldoPedido(total, pago ?? '0')
  const recebeu = Number(s.pago) > 0
  const quitado = recebeu && Number(s.falta) === 0
  if (!recebeu || cancelado) return <span className={cn('font-semibold tabular-nums', className)}>{formatarMoeda(total)}</span>
  return (
    <span className={cn('inline-flex flex-col items-end leading-tight tabular-nums', className)} title={`Pago ${formatarMoeda(s.pago)} de ${formatarMoeda(total)}`}>
      {quitado ? <span className="font-semibold">{formatarMoeda(total)}</span> : <span className="font-semibold text-amber-800">Falta {formatarMoeda(s.falta)}</span>}
      <span className={cn('text-[0.6875rem] font-normal', quitado ? 'text-green-800' : 'text-texto-secundario')}>{quitado ? 'pago' : `de ${formatarMoeda(total)}`}</span>
    </span>
  )
}

/** Atalho para o pedido (cancelado mostra só o total). */
export const ValorPedido = ({ pedido: p, className }: { pedido: { total: string; valorPago: string; status: string }; className?: string }) => (
  <ValorComSaldo total={p.total} pago={p.valorPago} cancelado={p.status === 'cancelado'} className={className} />
)
