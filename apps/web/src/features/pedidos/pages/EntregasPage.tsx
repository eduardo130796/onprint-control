import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { STATUS_ENTREGA, STATUS_ENTREGA_ROTULOS, TIPO_ENTREGA_ROTULOS, formatarDataHora, type Entrega, type StatusEntrega } from '@onprint/shared'
import { entregasApi } from '@/api/producao'
import { PageHeader } from '@/components/layout/PageHeader'
import { ABAS_PEDIDOS } from '@/app/abas'
import { AbasNavegacao } from '@/components/shared/AbasNavegacao'
import { DataTable } from '@/components/shared/data-table/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useListagem } from '@/hooks/useListagem'
import { SeloEntrega } from '../components/detalhe/AbaEntrega'

/** Agenda de entregas, retiradas e instalações (padrão: pendentes e agendadas, por data). */
export function EntregasPage() {
  const navigate = useNavigate()
  const lista = useListagem<{ status?: string; de?: string; ate?: string }>({})
  const params = { ...lista.params, status: lista.filtros.status as StatusEntrega | undefined }
  const consulta = useQuery({ queryKey: ['entregas', 'lista', params], queryFn: () => entregasApi.listar(params), placeholderData: keepPreviousData })

  const colunas = useMemo<ColumnDef<Entrega, unknown>[]>(
    () => [
      {
        id: 'data',
        header: 'Agendada para',
        meta: { ordenavel: 'dataAgendada' },
        cell: ({ row }) => (row.original.dataAgendada ? formatarDataHora(row.original.dataAgendada) : <span className="text-texto-secundario">sem data</span>),
      },
      {
        id: 'pedido',
        header: 'Pedido',
        cell: ({ row: { original: e } }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{e.pedido?.cliente.nome}</p>
            <p className="flex items-center gap-2 text-xs text-texto-secundario">
              <span className="font-mono">{e.pedido?.numero}</span>
              {e.pedido && <StatusBadge entidade="pedido" codigo={e.pedido.status} className="text-[11px]" />}
            </p>
          </div>
        ),
      },
      { id: 'tipo', header: 'Tipo', cell: ({ row }) => TIPO_ENTREGA_ROTULOS[row.original.tipo] },
      { id: 'endereco', header: 'Endereço', meta: { ocultarNoCard: true }, cell: ({ row }) => <span className="line-clamp-2 text-xs">{row.original.endereco ?? '—'}</span> },
      { id: 'responsavel', header: 'Responsável', cell: ({ row }) => row.original.responsavel?.nome ?? '—' },
      { id: 'status', header: 'Status', cell: ({ row }) => <SeloEntrega status={row.original.status} /> },
    ],
    [],
  )

  return (
    <>
      <PageHeader titulo="Entregas" subtitulo="Agenda de entregas, retiradas e instalações." />
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
        idLinha={(e) => e.id}
        onLinhaClick={(e) => navigate(`/pedidos/${e.pedidoId}?aba=entrega`)}
        busca={{ valor: lista.busca, onChange: lista.setBusca, placeholder: 'Pedido ou cliente…' }}
        filtros={
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-44">
              <Select value={lista.filtros.status ?? ''} onChange={(e) => lista.setFiltro('status', e.target.value || undefined)} aria-label="Status">
                <option value="">Pendentes e agendadas</option>
                {STATUS_ENTREGA.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_ENTREGA_ROTULOS[s]}
                  </option>
                ))}
              </Select>
            </div>
            <Input type="date" className="w-40" value={lista.filtros.de ?? ''} onChange={(e) => lista.setFiltro('de', e.target.value || undefined)} aria-label="De" />
            <Input type="date" className="w-40" value={lista.filtros.ate ?? ''} onChange={(e) => lista.setFiltro('ate', e.target.value || undefined)} aria-label="Até" />
          </div>
        }
        vazio={{ titulo: 'Nenhuma entrega', descricao: 'Registre entregas na aba “Entrega” do pedido.' }}
      />
    </>
  )
}
