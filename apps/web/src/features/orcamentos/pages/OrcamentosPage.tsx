import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { STATUS_ORCAMENTO, formatarData, formatarDataSimples, formatarMoeda, hojeISO, type Orcamento, type StatusOrcamento } from '@onprint/shared'
import { orcamentosApi } from '@/api/comercial'
import { PageHeader } from '@/components/layout/PageHeader'
import { Can } from '@/components/shared/Can'
import { DataTable } from '@/components/shared/data-table/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form-controls'
import { useListagem } from '@/hooks/useListagem'
import { useStatusConfig } from '@/hooks/useStatusConfig'
import { buscarTodasPaginas } from '@/lib/paginacao'
import { cn } from '@/lib/utils'
import { AbasComercial } from '../components/AbasComercial'
import { abrirLinha } from '@/lib/abrirLinha'
import { PainelOrcamento } from '../components/kanban/PainelOrcamento'

const ABERTOS = ['rascunho', 'enviado', 'em_negociacao']

export function OrcamentosPage() {
  const navigate = useNavigate()
  // Painel lateral da linha clicada (resumo + ações sem sair da lista)
  const [aberto, setAberto] = useState<Orcamento | null>(null)
  const { mapa } = useStatusConfig()
  const lista = useListagem<{ status?: string }>({})
  const params = { ...lista.params, status: lista.filtros.status as StatusOrcamento | undefined }
  const consulta = useQuery({ queryKey: ['orcamentos', 'lista', params], queryFn: () => orcamentosApi.listar(params), placeholderData: keepPreviousData })
  const hoje = hojeISO()

  const colunas = useMemo<ColumnDef<Orcamento, unknown>[]>(
    () => [
      { id: 'numero', header: 'Número', meta: { ordenavel: 'numero' }, cell: ({ row }) => <span className="font-mono text-xs">{row.original.numero}</span> },
      {
        id: 'cliente',
        header: 'Cliente',
        cell: ({ row: { original: o } }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{o.cliente.nome}</p>
            {o.cliente.situacao === 'pre_cadastro' && <p className="text-xs text-amber-800">pré-cadastro</p>}
          </div>
        ),
      },
      { id: 'vendedor', header: 'Vendedor', meta: { apartirDe: '2xl' }, cell: ({ row }) => row.original.vendedor?.nome ?? '—' },
      { id: 'criado', header: 'Criado em', meta: { ordenavel: 'createdAt', apartirDe: 'xl' }, cell: ({ row }) => formatarData(row.original.createdAt) },
      {
        id: 'validade',
        header: 'Validade',
        meta: { ordenavel: 'validade' },
        cell: ({ row: { original: o } }) => {
          const vencendo = ABERTOS.includes(o.status) && o.validade.slice(0, 10) <= hoje
          return <span className={cn(vencendo && 'font-medium text-coral-escuro')}>{formatarDataSimples(o.validade)}</span>
        },
      },
      { id: 'total', header: 'Total', meta: { ordenavel: 'total', className: 'text-right' }, cell: ({ row }) => <span className="font-medium">{formatarMoeda(row.original.total)}</span> },
      { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge entidade="orcamento" codigo={row.original.status} /> },
    ],
    [hoje],
  )

  return (
    <>
      <PageHeader
        titulo="Orçamentos"
        subtitulo="Do primeiro contato ao pedido."
        acoes={
          <Can modulo="orcamentos" acao="criar">
            <Button onClick={() => navigate('/orcamentos/novo')}>
              <Plus /> Novo orçamento
            </Button>
          </Can>
        }
      />
      <AbasComercial />
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
        idLinha={(o) => o.id}
        onLinhaClick={(o, e) => abrirLinha(e, `/orcamentos/${o.id}`, () => setAberto(o))}
        busca={{ valor: lista.busca, onChange: lista.setBusca, placeholder: 'Número ou cliente…' }}
        filtros={
          <div className="w-48">
            <Select value={lista.filtros.status ?? ''} onChange={(e) => lista.setFiltro('status', e.target.value || undefined)} aria-label="Status">
              <option value="">Todos os status</option>
              {STATUS_ORCAMENTO.map((s) => (
                <option key={s} value={s}>
                  {mapa.get(`orcamento:${s}`)?.rotulo ?? s}
                </option>
              ))}
            </Select>
          </div>
        }
        exportar={{
          nomeArquivo: 'orcamentos',
          buscarTodos: () => buscarTodasPaginas((page, pageSize) => orcamentosApi.listar({ ...params, page, pageSize })),
          colunas: [
            { titulo: 'Número', valor: (o) => o.numero },
            { titulo: 'Cliente', valor: (o) => o.cliente.nome },
            { titulo: 'Vendedor', valor: (o) => o.vendedor?.nome },
            { titulo: 'Criado em', valor: (o) => formatarData(o.createdAt) },
            { titulo: 'Validade', valor: (o) => formatarDataSimples(o.validade) },
            { titulo: 'Status', valor: (o) => mapa.get(`orcamento:${o.status}`)?.rotulo ?? o.status },
            { titulo: 'Total', valor: (o) => Number(o.total).toFixed(2).replace('.', ',') },
          ],
        }}
        vazio={{ titulo: 'Nenhum orçamento', descricao: 'Crie um orçamento a partir de uma solicitação ou pelo botão “Novo orçamento”.' }}
      />
      {aberto && <PainelOrcamento orcamento={aberto} onFechar={() => setAberto(null)} />}
    </>
  )
}
