import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Factory, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatarDataSimples, type PedidoDetalhe } from '@onprint/shared'
import { opsApi, pedidosApi } from '@/api/producao'
import { Can } from '@/components/shared/Can'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { SeloAtraso } from '@/components/shared/Selos'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/** OPs do pedido. Itens sem OP ativa (ex.: OP criada depois) podem gerar a OP por aqui. */
export function AbaProducao({ pedido }: { pedido: PedidoDetalhe }) {
  const queryClient = useQueryClient()
  const consulta = useQuery({
    queryKey: ['ops', 'pedido', pedido.id],
    queryFn: () => opsApi.listar({ pedidoId: pedido.id, incluirConcluidas: 'true', pageSize: 100, sort: 'numero:asc' }),
  })
  const semOp = pedido.itens.filter((i) => !i.ordensProducao.some((o) => !o.cancelada))
  const ativo = !['cancelado', 'entregue'].includes(pedido.status)

  async function gerar() {
    try {
      const { criadas } = await pedidosApi.gerarOps(pedido.id)
      toast.success(`${criadas} OP(s) gerada(s).`)
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['ops'] }), queryClient.invalidateQueries({ queryKey: ['pedidos'] })])
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (consulta.isPending) return <Skeleton className="h-32 w-full" />
  if (consulta.isError) return <Card><EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} /></Card>

  return (
    <div className="space-y-3">
      {semOp.length > 0 && ativo && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <span>{semOp.length} item(ns) sem ordem de produção.</span>
          <Can modulo="producao" acao="criar">
            <Button size="sm" onClick={() => void gerar()}>
              <Wand2 /> Gerar OPs
            </Button>
          </Can>
        </Card>
      )}
      {consulta.data.data.length === 0 ? (
        <Card>
          <EmptyState icone={Factory} titulo="Nenhuma OP" />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {consulta.data.data.map((op) => (
              <li key={op.id}>
                <Link to={`/producao/ordens/${op.id}`} className="flex flex-wrap items-center gap-3 p-4 text-sm hover:bg-fundo/60">
                  <span className="font-mono text-xs font-semibold">{op.numero}</span>
                  <span className="min-w-0 flex-1 truncate">{op.item.descricao}</span>
                  <StatusBadge entidade="producao" codigo={op.etapaAtual} />
                  {op.atrasada && <SeloAtraso />}
                  <span className="text-texto-secundario">{op.maquina?.nome ?? 'sem máquina'}</span>
                  <span className="text-texto-secundario">prazo {formatarDataSimples(op.dataFimPrevista ?? pedido.dataPrevistaEntrega)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
