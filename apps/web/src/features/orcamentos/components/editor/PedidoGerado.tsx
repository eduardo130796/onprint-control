import { Link } from 'react-router-dom'
import { ArrowRight, ShoppingCart } from 'lucide-react'
import { formatarDataSimples, formatarMoeda, type PedidoResumo } from '@onprint/shared'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** Resumo do pedido gerado pela conversão, com atalho para o pedido. */
export function PedidoGerado({ pedido }: { pedido: PedidoResumo }) {
  // Itens sem arte não ganham arte na conversão
  const artes = pedido.itens.flatMap((i) => i.artes)
  return (
    <Card className="border border-verde/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingCart className="h-4 w-4 text-verde" /> Pedido {pedido.numero}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge entidade="pedido" codigo={pedido.status} />
          <span className="text-texto-secundario">Previsão de entrega: {formatarDataSimples(pedido.dataPrevistaEntrega)}</span>
        </div>
        <div>
          <p className="mb-1 font-medium">Contas a receber</p>
          <ul className="space-y-1">
            {pedido.contasReceber.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span className="whitespace-nowrap text-texto-secundario">
                  {c.parcela}/{c.totalParcelas} · vence {formatarDataSimples(c.vencimento)}
                </span>
                <span className="ml-auto flex items-center gap-2 whitespace-nowrap">
                  {formatarMoeda(c.valor)}
                  <StatusBadge entidade="conta" codigo={c.status} />
                </span>
              </li>
            ))}
          </ul>
        </div>
        {pedido.comissoes.length > 0 && (
          <p className="text-texto-secundario">
            Comissão prevista: {formatarMoeda(pedido.comissoes[0]!.valor)} ({Number(pedido.comissoes[0]!.percentual).toLocaleString('pt-BR')}%)
          </p>
        )}
        <p className="text-texto-secundario">{artes.length ? `${artes.length} arte(s) no pedido.` : 'Nenhum item precisa de arte: o pedido segue direto para a produção.'}</p>
        <Link to={`/pedidos/${pedido.id}`} className="inline-flex items-center gap-1 font-medium text-marca-escuro hover:underline">
          Abrir pedido <ArrowRight className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  )
}
