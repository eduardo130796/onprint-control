import { useState } from 'react'
import { CircleDollarSign } from 'lucide-react'
import { formatarDataSimples, formatarMoeda, type ContaReceberResumo, type PedidoDetalhe } from '@onprint/shared'
import { Can } from '@/components/shared/Can'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BaixaDialog } from '@/features/financeiro/components/BaixaDialog'
import { TituloDetalheDialog } from '@/features/financeiro/components/TituloDetalheDialog'
import { usePermission } from '@/hooks/usePermission'
import { cn } from '@/lib/utils'

const STATUS_FINANCEIRO = { pendente: 'Pendente', parcial: 'Pago em parte', pago: 'Pago' } as const
const COMISSAO = { prevista: 'prevista (libera quando o pedido estiver pago)', liberada: 'liberada para pagamento', paga: 'paga' } as const

/** Parcelas do pedido com recebimento direto (financeiro) e situação da comissão. */
export function AbaFinanceiro({ pedido }: { pedido: PedidoDetalhe }) {
  const podeVer = usePermission('financeiro')
  const [receber, setReceber] = useState<ContaReceberResumo | null>(null)
  const [detalhe, setDetalhe] = useState<string | null>(null)
  const aberto = Number(pedido.total) - Number(pedido.valorPago)
  const saldoDe = (c: ContaReceberResumo) => (Number(c.valor) - Number(c.valorPago ?? 0)).toFixed(2)

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contas a receber</CardTitle>
        </CardHeader>
        <CardContent>
          {pedido.contasReceber.length === 0 ? (
            <p className="text-sm text-texto-secundario">Nenhum título gerado.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {pedido.contasReceber.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <button type="button" disabled={!podeVer} className="min-w-0 flex-1 text-left enabled:hover:underline" onClick={() => setDetalhe(c.id)}>
                    {c.descricao} <span className="text-texto-secundario">({c.parcela}/{c.totalParcelas})</span>
                  </button>
                  <span className="text-texto-secundario">vence {formatarDataSimples(c.vencimento)}</span>
                  <span className="font-medium">{formatarMoeda(c.valor)}</span>
                  <StatusBadge entidade="conta" codigo={c.status} />
                  {['aberto', 'parcial', 'vencido'].includes(c.status) && (
                    <Can modulo="financeiro" acao="editar">
                      <Button size="sm" variant="outline" onClick={() => setReceber(c)}>
                        <CircleDollarSign /> Receber
                      </Button>
                    </Can>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumo</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-texto-secundario">Situação</dt>
              <dd className={cn('font-medium', pedido.statusFinanceiro === 'pago' ? 'text-green-800' : pedido.statusFinanceiro === 'parcial' ? 'text-amber-800' : '')}>
                {STATUS_FINANCEIRO[pedido.statusFinanceiro]}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-texto-secundario">Total</dt>
              <dd className="font-medium">{formatarMoeda(pedido.total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-texto-secundario">Pago</dt>
              <dd>{formatarMoeda(pedido.valorPago)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-texto-secundario">Em aberto</dt>
              <dd className="font-medium">{formatarMoeda(aberto)}</dd>
            </div>
            {pedido.comissoes.map((c) => (
              <div key={c.id} className="border-t border-border pt-1.5">
                <div className="flex justify-between">
                  <dt className="text-texto-secundario">
                    Comissão {c.vendedor.nome.split(' ')[0]} ({Number(c.percentual).toLocaleString('pt-BR')}%)
                  </dt>
                  <dd>{formatarMoeda(c.valor)}</dd>
                </div>
                <p className="text-xs text-texto-secundario">{COMISSAO[c.status as keyof typeof COMISSAO] ?? c.status}</p>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      {receber && <BaixaDialog tipo="receber" titulo={{ ...receber, valorPago: receber.valorPago ?? '0', saldo: saldoDe(receber) }} onFechar={() => setReceber(null)} />}
      <TituloDetalheDialog tipo="receber" id={detalhe} onFechar={() => setDetalhe(null)} />
    </div>
  )
}
