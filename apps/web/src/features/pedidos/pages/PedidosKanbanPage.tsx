import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { toast } from 'sonner'
import { STATUS_PEDIDO_FINAIS, podeMudarStatusPedido, type Pedido, type StatusPedido } from '@onprint/shared'
import { pedidosApi } from '@/api/producao'
import { PageHeader } from '@/components/layout/PageHeader'
import { ABAS_PEDIDOS } from '@/app/abas'
import { AbasNavegacao } from '@/components/shared/AbasNavegacao'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Kanban, type ColunaDef } from '@/components/shared/kanban/Kanban'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useImpressao } from '@/features/impressao/useImpressao'
import { destinoDaColuna, montarColunas, personalizadoValido } from '@/lib/colunasStatus'
import { useDebounce } from '@/hooks/useDebounce'
import { usePermission } from '@/hooks/usePermission'
import { useStatusDaEntidade } from '@/hooks/useStatusConfig'
import { buscarTodasPaginas } from '@/lib/paginacao'
import { CartaoPedido } from '../components/kanban/CartaoPedido'
import { PainelPedido } from '../components/kanban/PainelPedido'

const idDoPedido = (p: Pedido) => p.id

/**
 * Kanban de pedidos: arrastar muda o status (livre, exceto sair de entregue/cancelado). A arte e a
 * produção continuam mudando o status sozinhas depois. Cada cartão tem atalhos para editar e imprimir.
 */
export function PedidosKanbanPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const impressao = useImpressao()
  const [aberto, setAberto] = useState<Pedido | null>(null)
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
      montarColunas(
        status.filter((s) => (s.base ?? s.codigo) !== 'cancelado'),
        consulta.data ?? [],
        (p) => p.status,
        (p) => p.statusPersonalizadoId,
      ),
    [status, consulta.data],
  )

  // Coluna própria = status do sistema (base) + o id dela; mesma base só troca a coluna
  const podeSoltar = useCallback(
    (p: Pedido, destino: string) => {
      const { base } = destinoDaColuna(status, destino)
      return base === p.status || podeMudarStatusPedido(p.status, base as StatusPedido)
    },
    [status],
  )

  const onMover = useCallback(
    async (p: Pedido, destino: string) => {
      try {
        const { base, personalizadoId } = destinoDaColuna(status, destino)
        const mudouBase = base !== p.status
        if (mudouBase) await pedidosApi.mudarStatus(p.id, base as StatusPedido)
        if (personalizadoId !== (mudouBase ? null : personalizadoValido(status, p.status, p.statusPersonalizadoId))) {
          await pedidosApi.statusPersonalizado(p.id, personalizadoId)
        }
        await queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      } catch (e) {
        toast.error((e as Error).message)
        throw e
      }
    },
    [queryClient, status],
  )
  const { pedido: imprimirPedido, ocupado } = impressao
  const renderCartao = useCallback(
    (p: Pedido) => (
      <CartaoPedido
        pedido={p}
        acoes={{
          onAbrir: setAberto,
          onEditar: (x) => navigate(`/pedidos/${x.id}?editar=1`),
          onImprimir: (x) => void imprimirPedido(x.id, 'imprimir'),
          imprimindo: ocupado === `pedido:${p.id}:imprimir`,
        }}
      />
    ),
    [navigate, imprimirPedido, ocupado],
  )
  const podeArrastar = useCallback((p: Pedido) => podeEditar && !STATUS_PEDIDO_FINAIS.includes(p.status), [podeEditar])

  return (
    <>
      <PageHeader
        titulo="Kanban de pedidos"
        subtitulo={
          <span className="inline-flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" /> Clique no cartão para ver detalhes e ações. Arraste para mudar o status (a arte e a produção continuam atualizando sozinhas).
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
        <Kanban colunas={colunas} idDe={idDoPedido} renderCartao={renderCartao} podeArrastar={podeArrastar} podeSoltar={podeSoltar} onMover={onMover} reordenavel={false} onAbrir={setAberto} />
      )}
      {aberto && <PainelPedido pedido={aberto} onFechar={() => setAberto(null)} />}
    </>
  )
}
