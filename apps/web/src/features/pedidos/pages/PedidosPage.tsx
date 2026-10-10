import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { STATUS_PEDIDO, formatarData, formatarDataSimples, saldoPedido, type Pedido, type StatusPedido } from '@onprint/shared'
import { pedidosApi } from '@/api/producao'
import { PageHeader } from '@/components/layout/PageHeader'
import { ABAS_PEDIDOS } from '@/app/abas'
import { AbasNavegacao } from '@/components/shared/AbasNavegacao'
import { DataTable } from '@/components/shared/data-table/DataTable'
import { SeloAtraso, SeloPrioridade } from '@/components/shared/Selos'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Checkbox, Select } from '@/components/ui/form-controls'
import { useListagem } from '@/hooks/useListagem'
import { useStatusConfig } from '@/hooks/useStatusConfig'
import { buscarTodasPaginas } from '@/lib/paginacao'
import { cn } from '@/lib/utils'
import { ValorPedido } from '@/components/shared/ValorComSaldo'
import { abrirLinha } from '@/lib/abrirLinha'
import { PainelPedido } from '../components/kanban/PainelPedido'

/** Progresso do pedido: artes aprovadas e OPs concluídas. */
function Progresso({ pedido }: { pedido: Pedido }) {
  const r = pedido.resumo
  if (!r) return null
  return (
    <span className="text-xs text-texto-secundario">
      Arte {r.artesAprovadas}/{r.artes} · OP {r.opsConcluidas}/{r.ops}
    </span>
  )
}

export function PedidosPage() {
  // Painel lateral da linha clicada (resumo + ações sem sair da lista)
  const [aberto, setAberto] = useState<Pedido | null>(null)
  const { mapa } = useStatusConfig()
  const lista = useListagem<{ status?: string; atrasados?: string; incluirFinalizados?: string }>({})
  const params = { ...lista.params, status: lista.filtros.status as StatusPedido | undefined } as Parameters<typeof pedidosApi.listar>[0]
  const consulta = useQuery({ queryKey: ['pedidos', 'lista', params], queryFn: () => pedidosApi.listar(params), placeholderData: keepPreviousData })

  const colunas = useMemo<ColumnDef<Pedido, unknown>[]>(
    () => [
      { id: 'numero', header: 'Número', meta: { ordenavel: 'numero' }, cell: ({ row }) => <span className="font-mono text-xs">{row.original.numero}</span> },
      {
        id: 'cliente',
        header: 'Cliente',
        cell: ({ row: { original: p } }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{p.cliente.nome}</p>
            <Progresso pedido={p} />
          </div>
        ),
      },
      { id: 'vendedor', header: 'Vendedor', meta: { ocultarNoCard: true, apartirDe: '2xl' }, cell: ({ row }) => row.original.vendedor?.nome ?? '—' },
      { id: 'criado', header: 'Criado em', meta: { ordenavel: 'createdAt', ocultarNoCard: true, apartirDe: 'xl' }, cell: ({ row }) => formatarData(row.original.createdAt) },
      {
        id: 'entrega',
        header: 'Entrega',
        meta: { ordenavel: 'dataPrevistaEntrega' },
        cell: ({ row: { original: p } }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn(p.atrasado && 'font-medium text-coral-escuro')}>{formatarDataSimples(p.dataPrevistaEntrega)}</span>
            {p.atrasado && <SeloAtraso />}
            <SeloPrioridade prioridade={p.prioridade} />
          </div>
        ),
      },
      { id: 'total', header: 'Total', meta: { ordenavel: 'total', className: 'text-right' }, cell: ({ row }) => <ValorPedido pedido={row.original} className="font-medium" /> },
      { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge entidade="pedido" codigo={row.original.status} /> },
    ],
    [],
  )

  return (
    <>
      <PageHeader titulo="Pedidos de venda" subtitulo="Nascem da conversão de orçamentos aprovados." />
      <AbasNavegacao rotulo="Pedidos" abas={ABAS_PEDIDOS} />
      <DataTable
        colunas={colunas}
        resultado={consulta.data}
        carregando={consulta.isFetching}
        erro={consulta.error}
        onTentarNovamente={() => void consulta.refetch()}
        page={lista.page}
        pageSize={lista.pageSize}
        sort={lista.sort}
        onPageChange={lista.setPage}
        onPageSizeChange={lista.setPageSize}
        onSortChange={lista.setSort}
        idLinha={(p) => p.id}
        onLinhaClick={(p, e) => abrirLinha(e, `/pedidos/${p.id}`, () => setAberto(p))}
        destacarLinha={(p) => p.atrasado}
        busca={{ valor: lista.busca, onChange: lista.setBusca, placeholder: 'Número ou cliente…' }}
        filtros={
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-48">
              <Select value={lista.filtros.status ?? ''} onChange={(e) => lista.setFiltro('status', e.target.value || undefined)} aria-label="Status">
                <option value="">Todos os status</option>
                {STATUS_PEDIDO.map((s) => (
                  <option key={s} value={s}>
                    {mapa.get(`pedido:${s}`)?.rotulo ?? s}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={lista.filtros.atrasados === 'true'} onChange={(e) => lista.setFiltro('atrasados', e.target.checked ? 'true' : undefined)} /> Atrasados
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={lista.filtros.incluirFinalizados === 'true'} onChange={(e) => lista.setFiltro('incluirFinalizados', e.target.checked ? 'true' : undefined)} /> Incluir cancelados
            </label>
          </div>
        }
        exportar={{
          nomeArquivo: 'pedidos',
          buscarTodos: () => buscarTodasPaginas((page, pageSize) => pedidosApi.listar({ ...params, page, pageSize })),
          colunas: [
            { titulo: 'Número', valor: (p) => p.numero },
            { titulo: 'Cliente', valor: (p) => p.cliente.nome },
            { titulo: 'Vendedor', valor: (p) => p.vendedor?.nome },
            { titulo: 'Criado em', valor: (p) => formatarData(p.createdAt) },
            { titulo: 'Entrega prevista', valor: (p) => formatarDataSimples(p.dataPrevistaEntrega) },
            { titulo: 'Status', valor: (p) => mapa.get(`pedido:${p.status}`)?.rotulo ?? p.status },
            { titulo: 'Total', valor: (p) => Number(p.total).toFixed(2).replace('.', ',') },
            { titulo: 'Pago', valor: (p) => saldoPedido(p.total, p.valorPago).pago.replace('.', ',') },
            { titulo: 'A receber', valor: (p) => saldoPedido(p.total, p.valorPago).falta.replace('.', ',') },
          ],
        }}
        vazio={{ titulo: 'Nenhum pedido', descricao: 'Converta um orçamento aprovado para criar o primeiro pedido.' }}
      />
      {aberto && <PainelPedido pedido={aberto} onFechar={() => setAberto(null)} />}
    </>
  )
}
