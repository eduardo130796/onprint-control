import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Info } from 'lucide-react'
import { toast } from 'sonner'
import { TRANSICOES_MANUAIS_PEDIDO, formatarDataSimples, formatarMoeda, type Pedido, type StatusPedido } from '@onprint/shared'
import { pedidosApi } from '@/api/producao'
import { PageHeader } from '@/components/layout/PageHeader'
import { ABAS_PEDIDOS } from '@/app/abas'
import { AbasNavegacao } from '@/components/shared/AbasNavegacao'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Kanban, type ColunaDef } from '@/components/shared/kanban/Kanban'
import { SeloAtraso, SeloPrioridade } from '@/components/shared/Selos'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useDebounce } from '@/hooks/useDebounce'
import { usePermission } from '@/hooks/usePermission'
import { useStatusDaEntidade } from '@/hooks/useStatusConfig'
import { buscarTodasPaginas } from '@/lib/paginacao'
import { cn } from '@/lib/utils'

function CartaoPedido({ pedido: p }: { pedido: Pedido }) {
  return (
    <article className={cn('rounded-xl border bg-card p-3 text-sm shadow-sm', p.atrasado ? 'border-coral/60' : 'border-transparent')}>
      <div className="flex items-center justify-between gap-2">
        <Link to={`/pedidos/${p.id}`} className="font-mono text-xs font-semibold text-petroleo hover:underline" onPointerDown={(e) => e.stopPropagation()}>
          {p.numero}
        </Link>
        <span className="text-xs font-medium">{formatarMoeda(p.total)}</span>
      </div>
      <p className="truncate font-medium" title={p.cliente.nome}>
        {p.cliente.nome}
      </p>
      {p.resumo && (
        <p className="text-xs text-texto-secundario">
          Arte {p.resumo.artesAprovadas}/{p.resumo.artes} · OP {p.resumo.opsConcluidas}/{p.resumo.ops}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className={cn('inline-flex items-center gap-1 text-texto-secundario', p.atrasado && 'font-medium text-coral-escuro')}>
          <CalendarClock className="h-3 w-3" /> {formatarDataSimples(p.dataPrevistaEntrega)}
        </span>
        {p.atrasado && <SeloAtraso />}
        <SeloPrioridade prioridade={p.prioridade} />
      </div>
    </article>
  )
}

const idDoPedido = (p: Pedido) => p.id
const podeSoltar = (p: Pedido, destino: string) => Boolean(TRANSICOES_MANUAIS_PEDIDO[p.status]?.includes(destino as StatusPedido))

/**
 * Kanban de pedidos: a maioria das mudanças é automática (arte e produção); à mão só
 * pronto ⇄ em entrega → entregue. Colunas que não aceitam o cartão ficam apagadas ao arrastar.
 */
export function PedidosKanbanPage() {
  const queryClient = useQueryClient()
  const status = useStatusDaEntidade('pedido')
  const podeEditar = usePermission('pedidos', 'editar')
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useDebounce(busca.trim())
  const params = { kanban: 'true' as const, busca: buscaAtrasada || undefined }
  const consulta = useQuery({
    queryKey: ['pedidos', 'kanban', params],
    queryFn: () => buscarTodasPaginas((page, pageSize) => pedidosApi.listar({ ...params, page, pageSize })),
  })

  const colunas = useMemo<ColunaDef<Pedido>[]>(
    () =>
      status
        .filter((s) => s.codigo !== 'cancelado')
        .map((s) => ({ id: s.codigo, titulo: s.rotulo, cor: s.cor, itens: (consulta.data ?? []).filter((p) => p.status === s.codigo) })),
    [status, consulta.data],
  )

  const onMover = useCallback(
    async (p: Pedido, destino: string) => {
      try {
        await pedidosApi.mudarStatus(p.id, destino as StatusPedido)
        await queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      } catch (e) {
        toast.error((e as Error).message)
        throw e
      }
    },
    [queryClient],
  )
  const renderCartao = useCallback((p: Pedido) => <CartaoPedido pedido={p} />, [])
  const podeArrastar = useCallback((p: Pedido) => podeEditar && Boolean(TRANSICOES_MANUAIS_PEDIDO[p.status]), [podeEditar])

  return (
    <>
      <PageHeader
        titulo="Kanban de pedidos"
        subtitulo={
          <span className="inline-flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" /> O status anda sozinho com a arte e a produção. Arraste só para registrar a saída e a entrega.
          </span>
        }
      />
      <AbasNavegacao rotulo="Pedidos" abas={ABAS_PEDIDOS} />
      <div className="mb-4 max-w-sm">
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Número, cliente ou item…" aria-label="Buscar" />
      </div>
      {consulta.isPending || status.length === 0 ? (
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-96 w-72 shrink-0" />
          ))}
        </div>
      ) : consulta.isError ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <Kanban colunas={colunas} idDe={idDoPedido} renderCartao={renderCartao} podeArrastar={podeArrastar} podeSoltar={podeSoltar} onMover={onMover} reordenavel={false} />
      )}
    </>
  )
}
