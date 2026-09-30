import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FilePlus2, FileText } from 'lucide-react'
import { formatarData, formatarDataSimples, formatarMoeda } from '@onprint/shared'
import { orcamentosApi } from '@/api/comercial'
import { Can } from '@/components/shared/Can'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/** Aba "Orçamentos" da ficha do cliente (respeita o escopo "só os meus" da API). */
export function OrcamentosDoCliente({ clienteId }: { clienteId: string }) {
  const consulta = useQuery({ queryKey: ['orcamentos', 'cliente', clienteId], queryFn: () => orcamentosApi.listar({ clienteId, pageSize: 50 }) })
  const novo = (
    <Can modulo="orcamentos" acao="criar">
      <Button asChild>
        <Link to={`/orcamentos/novo?cliente=${clienteId}`}>
          <FilePlus2 /> Novo orçamento
        </Link>
      </Button>
    </Can>
  )

  if (consulta.isPending) return <Skeleton className="h-32 w-full" />
  if (consulta.isError) return <Card><EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} /></Card>
  if (consulta.data.data.length === 0) return <Card><EmptyState icone={FileText} titulo="Nenhum orçamento" acao={novo} /></Card>

  return (
    <div className="space-y-3">
      <div className="flex justify-end">{novo}</div>
      <Card>
        <ul className="divide-y divide-border">
          {consulta.data.data.map((o) => (
            <li key={o.id}>
              <Link to={`/orcamentos/${o.id}`} className="flex flex-wrap items-center gap-3 p-4 text-sm hover:bg-fundo/60">
                <span className="font-mono text-xs">{o.numero}</span>
                <StatusBadge entidade="orcamento" codigo={o.status} />
                <span className="text-texto-secundario">criado em {formatarData(o.createdAt)} · válido até {formatarDataSimples(o.validade)}</span>
                <span className="ml-auto font-medium">{formatarMoeda(o.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
