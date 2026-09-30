import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Banknote } from 'lucide-react'
import { formatarDataSimples, formatarMoeda } from '@onprint/shared'
import { titulosApi } from '@/api/financeiro'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TituloDetalheDialog } from '@/features/financeiro/components/TituloDetalheDialog'
import { cn } from '@/lib/utils'

/** Aba "Financeiro" da ficha do cliente: títulos a receber (abertos primeiro) e totais. */
export function FinanceiroDoCliente({ clienteId }: { clienteId: string }) {
  const consulta = useQuery({ queryKey: ['financeiro', 'receber', 'cliente', clienteId], queryFn: () => titulosApi('receber').listar({ clienteId, pageSize: 100, sort: 'vencimento:desc' }) })
  const [aberto, setAberto] = useState<string | null>(null)
  if (consulta.isPending) return <Skeleton className="h-32 w-full" />
  if (consulta.isError) return <Card><EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} /></Card>
  const { data, resumo } = consulta.data
  if (data.length === 0) return <Card><EmptyState icone={Banknote} titulo="Nenhuma conta a receber" /></Card>
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {[['Total', resumo.valor], ['Recebido', resumo.pago], ['Em aberto', resumo.saldo]].map(([r, v]) => (
          <Card key={r} className="p-4">
            <p className="text-xs text-texto-secundario">{r}</p>
            <p className="text-lg font-semibold text-petroleo">{formatarMoeda(v)}</p>
          </Card>
        ))}
      </div>
      <Card>
        <ul className="divide-y divide-border">
          {data.map((t) => (
            <li key={t.id}>
              <button type="button" className="flex w-full flex-wrap items-center gap-3 p-4 text-left text-sm hover:bg-fundo/60" onClick={() => setAberto(t.id)}>
                <span className={cn('w-24', t.atrasado && 'font-medium text-coral-escuro')}>{formatarDataSimples(t.vencimento)}</span>
                <span className="min-w-0 flex-1 truncate">{t.descricao}</span>
                <StatusBadge entidade="conta" codigo={t.status} />
                <span className="w-28 text-right font-medium">{formatarMoeda(t.saldo)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <TituloDetalheDialog tipo="receber" id={aberto} onFechar={() => setAberto(null)} />
    </div>
  )
}
