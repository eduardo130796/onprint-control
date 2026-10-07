import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { formatarDataSimples, formatarMoeda, type Titulo, type TitulosQuery } from '@onprint/shared'
import { titulosApi, type TipoTitulo } from '@/api/financeiro'
import { PageHeader } from '@/components/layout/PageHeader'
import { Can } from '@/components/shared/Can'
import { DataTable } from '@/components/shared/data-table/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useListagem } from '@/hooks/useListagem'
import { buscarTodasPaginas } from '@/lib/paginacao'
import { cn } from '@/lib/utils'
import { TituloDetalheDialog } from '../components/TituloDetalheDialog'
import { TituloDialog } from '../components/TituloDialog'

const SITUACOES = { abertos: 'Em aberto', atrasados: 'Atrasadas', pago: 'Pagas', cancelado: 'Canceladas', todas: 'Todas' } as const

/** Contas a receber (/financeiro/receber) e a pagar (/financeiro/pagar). */
export function TitulosPage({ tipo }: { tipo: TipoTitulo }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const api = titulosApi(tipo)
  const receber = tipo === 'receber'
  const lista = useListagem<{ situacao?: string; de?: string; ate?: string }>({ situacao: 'abertos' })
  const { situacao, ...resto } = lista.params
  const params: TitulosQuery = {
    ...resto,
    ...(situacao === 'abertos' ? { abertos: 'true' as const } : situacao === 'atrasados' ? { atrasados: 'true' as const } : situacao === 'pago' || situacao === 'cancelado' ? { status: situacao as 'pago' | 'cancelado' } : {}),
  }
  const consulta = useQuery({ queryKey: ['financeiro', tipo, 'lista', params], queryFn: () => api.listar(params), placeholderData: keepPreviousData })
  const [aberto, setAberto] = useState<string | null>(null)
  const novo = pathname.endsWith('/novo')

  const colunas = useMemo<ColumnDef<Titulo, unknown>[]>(
    () => [
      {
        id: 'vencimento',
        header: 'Vencimento',
        meta: { ordenavel: 'vencimento' },
        cell: ({ row: { original: t } }) => <span className={cn(t.atrasado && 'font-medium text-coral-escuro')}>{formatarDataSimples(t.vencimento)}</span>,
      },
      {
        id: 'descricao',
        header: 'Descrição',
        cell: ({ row: { original: t } }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{t.descricao}</p>
            <p className="truncate text-xs text-texto-secundario">
              {receber ? t.cliente?.nome : (t.fornecedor?.nome ?? 'Sem fornecedor')}
              {t.categoria && ` · ${t.categoria.nome}`}
            </p>
          </div>
        ),
      },
      { id: 'valor', header: 'Valor', meta: { ordenavel: 'valor', className: 'text-right' }, cell: ({ row }) => formatarMoeda(row.original.valor) },
      { id: 'saldo', header: 'Saldo', meta: { className: 'text-right' }, cell: ({ row }) => <span className="font-semibold">{formatarMoeda(row.original.saldo)}</span> },
      { id: 'status', header: 'Situação', cell: ({ row }) => <StatusBadge entidade="conta" codigo={row.original.status} /> },
    ],
    [receber],
  )
  const r = consulta.data?.resumo

  return (
    <>
      <PageHeader
        titulo={receber ? 'Contas a receber' : 'Contas a pagar'}
        subtitulo={receber ? 'Parcelas dos pedidos e lançamentos avulsos. Clique para receber.' : 'Fornecedores e despesas. Clique para pagar.'}
        acoes={
          <Can modulo="financeiro" acao="criar">
            <Button onClick={() => navigate(`/financeiro/${tipo}/novo`)}>
              <Plus /> {receber ? 'Nova conta a receber' : 'Nova conta a pagar'}
            </Button>
          </Can>
        }
      />
      {r && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {[
            ['Total no filtro', r.valor, 'text-grafite'],
            [receber ? 'Recebido' : 'Pago', r.pago, 'text-green-800'],
            [receber ? 'A receber' : 'A pagar', r.saldo, receber ? 'text-marca-escuro' : 'text-coral-escuro'],
          ].map(([rotulo, valor, cor]) => (
            <Card key={rotulo} className="p-4">
              <p className="text-xs text-texto-secundario">{rotulo}</p>
              <p className={cn('text-xl font-semibold', cor)}>{formatarMoeda(valor)}</p>
            </Card>
          ))}
        </div>
      )}
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
        idLinha={(t) => t.id}
        onLinhaClick={(t) => setAberto(t.id)}
        destacarLinha={(t) => t.atrasado}
        busca={{ valor: lista.busca, onChange: lista.setBusca, placeholder: receber ? 'Descrição, cliente ou pedido…' : 'Descrição, documento ou fornecedor…' }}
        filtros={
          <div className="flex flex-wrap gap-2">
            <div className="w-40">
              <Select value={lista.filtros.situacao ?? 'todas'} onChange={(e) => lista.setFiltro('situacao', e.target.value)} aria-label="Situação">
                {Object.entries(SITUACOES).map(([k, rotulo]) => (
                  <option key={k} value={k}>
                    {rotulo}
                  </option>
                ))}
              </Select>
            </div>
            <Input type="date" className="w-40" value={lista.filtros.de ?? ''} onChange={(e) => lista.setFiltro('de', e.target.value || undefined)} aria-label="Vencimento de" />
            <Input type="date" className="w-40" value={lista.filtros.ate ?? ''} onChange={(e) => lista.setFiltro('ate', e.target.value || undefined)} aria-label="Vencimento até" />
          </div>
        }
        exportar={{
          nomeArquivo: receber ? 'contas-a-receber' : 'contas-a-pagar',
          buscarTodos: () => buscarTodasPaginas((page, pageSize) => api.listar({ ...params, page, pageSize })),
          colunas: [
            { titulo: 'Vencimento', valor: (t) => formatarDataSimples(t.vencimento) },
            { titulo: 'Descrição', valor: (t) => t.descricao },
            { titulo: receber ? 'Cliente' : 'Fornecedor', valor: (t) => (receber ? t.cliente?.nome : t.fornecedor?.nome) },
            { titulo: 'Categoria', valor: (t) => t.categoria?.nome },
            { titulo: 'Valor', valor: (t) => Number(t.valor).toFixed(2).replace('.', ',') },
            { titulo: 'Pago', valor: (t) => Number(t.valorPago).toFixed(2).replace('.', ',') },
            { titulo: 'Situação', valor: (t) => t.status },
          ],
        }}
        vazio={{ titulo: 'Nenhuma conta neste filtro', descricao: receber ? 'As parcelas dos pedidos aparecem aqui automaticamente.' : 'Lance aluguel, compras e demais despesas.' }}
      />
      <TituloDetalheDialog tipo={tipo} id={aberto} onFechar={() => setAberto(null)} />
      {novo && <TituloDialog tipo={tipo} onFechar={() => navigate(`/financeiro/${tipo}`, { replace: true })} />}
    </>
  )
}

export const ContasReceberPage = () => <TitulosPage tipo="receber" />
export const ContasPagarPage = () => <TitulosPage tipo="pagar" />
