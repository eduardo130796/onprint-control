import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { ETAPAS_PRODUCAO, formatarDataSimples, type EtapaProducao, type OrdemProducao } from '@onprint/shared'
import { opsApi } from '@/api/producao'
import { PageHeader } from '@/components/layout/PageHeader'
import { ABAS_PRODUCAO } from '@/app/abas'
import { AbasNavegacao } from '@/components/shared/AbasNavegacao'
import { DataTable } from '@/components/shared/data-table/DataTable'
import { SeloAtraso, SeloPrioridade } from '@/components/shared/Selos'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Checkbox, Select } from '@/components/ui/form-controls'
import { useListagem } from '@/hooks/useListagem'
import { useStatusConfig } from '@/hooks/useStatusConfig'
import { buscarTodasPaginas } from '@/lib/paginacao'

/** Lista de ordens de produção (/producao/ordens), com filtro por etapa e CSV. */
export function OpsPage() {
  const navigate = useNavigate()
  const { mapa } = useStatusConfig()
  const lista = useListagem<{ etapa?: string; incluirConcluidas?: string; atrasadas?: string }>({})
  const params = { ...lista.params, etapa: lista.filtros.etapa as EtapaProducao | undefined } as Parameters<typeof opsApi.listar>[0]
  const consulta = useQuery({ queryKey: ['ops', 'lista', params], queryFn: () => opsApi.listar(params), placeholderData: keepPreviousData })

  const colunas = useMemo<ColumnDef<OrdemProducao, unknown>[]>(
    () => [
      { id: 'numero', header: 'OP', meta: { ordenavel: 'numero' }, cell: ({ row }) => <span className="font-mono text-xs">{row.original.numero}</span> },
      {
        id: 'item',
        header: 'Pedido / item',
        cell: ({ row: { original: op } }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{op.pedido.cliente.nome}</p>
            <p className="truncate text-xs text-texto-secundario">
              {op.pedido.numero} · {Number(op.quantidade).toLocaleString('pt-BR')} × {op.item.descricao}
            </p>
          </div>
        ),
      },
      { id: 'etapa', header: 'Etapa', cell: ({ row }) => <StatusBadge entidade="producao" codigo={row.original.etapaAtual} /> },
      { id: 'maquina', header: 'Máquina', meta: { ocultarNoCard: true }, cell: ({ row }) => row.original.maquina?.nome ?? '—' },
      { id: 'responsavel', header: 'Responsável', meta: { ocultarNoCard: true }, cell: ({ row }) => row.original.responsavel?.nome ?? '—' },
      {
        id: 'prazo',
        header: 'Prazo',
        meta: { ordenavel: 'dataFimPrevista' },
        cell: ({ row: { original: op } }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            {formatarDataSimples(op.dataFimPrevista ?? op.pedido.dataPrevistaEntrega)}
            {op.atrasada && <SeloAtraso />}
          </div>
        ),
      },
      { id: 'prioridade', header: 'Prioridade', cell: ({ row }) => <SeloPrioridade prioridade={row.original.prioridade} sempre /> },
    ],
    [],
  )

  return (
    <>
      <PageHeader titulo="Ordens de produção" subtitulo="Uma OP por item de pedido, geradas na conversão do orçamento." />
      <AbasNavegacao rotulo="Produção" abas={ABAS_PRODUCAO} />
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
        idLinha={(op) => op.id}
        onLinhaClick={(op) => navigate(`/producao/ordens/${op.id}`)}
        destacarLinha={(op) => op.atrasada}
        busca={{ valor: lista.busca, onChange: lista.setBusca, placeholder: 'OP, pedido, cliente ou item…' }}
        filtros={
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-44">
              <Select value={lista.filtros.etapa ?? ''} onChange={(e) => lista.setFiltro('etapa', e.target.value || undefined)} aria-label="Etapa">
                <option value="">Todas as etapas</option>
                {ETAPAS_PRODUCAO.map((e) => (
                  <option key={e} value={e}>
                    {mapa.get(`producao:${e}`)?.rotulo ?? e}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={lista.filtros.atrasadas === 'true'} onChange={(e) => lista.setFiltro('atrasadas', e.target.checked ? 'true' : undefined)} /> Atrasadas
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={lista.filtros.incluirConcluidas === 'true'} onChange={(e) => lista.setFiltro('incluirConcluidas', e.target.checked ? 'true' : undefined)} /> Incluir concluídas
            </label>
          </div>
        }
        exportar={{
          nomeArquivo: 'ordens-producao',
          buscarTodos: () => buscarTodasPaginas((page, pageSize) => opsApi.listar({ ...params, page, pageSize })),
          colunas: [
            { titulo: 'OP', valor: (op) => op.numero },
            { titulo: 'Pedido', valor: (op) => op.pedido.numero },
            { titulo: 'Cliente', valor: (op) => op.pedido.cliente.nome },
            { titulo: 'Item', valor: (op) => op.item.descricao },
            { titulo: 'Quantidade', valor: (op) => Number(op.quantidade).toLocaleString('pt-BR') },
            { titulo: 'Etapa', valor: (op) => mapa.get(`producao:${op.etapaAtual}`)?.rotulo ?? op.etapaAtual },
            { titulo: 'Máquina', valor: (op) => op.maquina?.nome },
            { titulo: 'Responsável', valor: (op) => op.responsavel?.nome },
            { titulo: 'Prazo', valor: (op) => formatarDataSimples(op.dataFimPrevista ?? op.pedido.dataPrevistaEntrega) },
            { titulo: 'Horas estimadas', valor: (op) => Number(op.horasEstimadas).toLocaleString('pt-BR') },
          ],
        }}
        vazio={{ titulo: 'Nenhuma OP', descricao: 'As ordens de produção nascem quando um orçamento aprovado vira pedido.' }}
      />
    </>
  )
}
