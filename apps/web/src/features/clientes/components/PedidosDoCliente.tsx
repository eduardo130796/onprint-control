import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ShoppingCart } from 'lucide-react'
import { formatarDataSimples, formatarMoeda } from '@onprint/shared'
import { pedidosApi } from '@/api/producao'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { SeloAtraso } from '@/components/shared/Selos'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/** Aba "Pedidos" da ficha do cliente (respeita o escopo "só os meus" da API). */
export function PedidosDoCliente({ clienteId }: { clienteId: string }) {
  const consulta = useQuery({
    queryKey: ['pedidos', 'cliente', clienteId],
    queryFn: () => pedidosApi.listar({ clienteId, pageSize: 50, incluirFinalizados: 'true', sort: 'createdAt:desc' }),
  })

  if (consulta.isPending) return <Skeleton className="h-32 w-full" />
  if (consulta.isError) return <Card><EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} /></Card>
  if (consulta.data.data.length === 0) {
    return <Card><EmptyState icone={ShoppingCart} titulo="Nenhum pedido" descricao="Os pedidos nascem da conversão de orçamentos aprovados." /></Card>
  }

  return (
    <Card>
      <ul className="divide-y divide-border">
        {consulta.data.data.map((p) => (
          <li key={p.id}>
            <Link to={`/pedidos/${p.id}`} className="flex flex-wrap items-center gap-3 p-4 text-sm hover:bg-fundo/60">
              <span className="font-mono text-xs">{p.numero}</span>
              <StatusBadge entidade="pedido" codigo={p.status} />
              {p.atrasado && <SeloAtraso />}
              <span className="text-texto-secundario">entrega {formatarDataSimples(p.dataPrevistaEntrega)}</span>
              <span className="ml-auto font-medium">{formatarMoeda(p.total)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
