import { useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowLeftRight } from 'lucide-react'
import { TIPOS_MOVIMENTACAO, TIPO_MOVIMENTACAO_ROTULOS, formatarDataHora, formatarMoeda, type MovimentacaoEstoque, type TipoMovimentacao } from '@onprint/shared'
import { estoqueApi } from '@/api/estoque'
import { ABAS_ESTOQUE } from '@/app/abas'
import { PageHeader } from '@/components/layout/PageHeader'
import { AbasNavegacao } from '@/components/shared/AbasNavegacao'
import { Can } from '@/components/shared/Can'
import { DataTable } from '@/components/shared/data-table/DataTable'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useListagem } from '@/hooks/useListagem'
import { buscarTodasPaginas } from '@/lib/paginacao'
import { formatarQuantidade } from '@/lib/quantidade'
import { cn } from '@/lib/utils'
import { MovimentacaoDialog } from '../components/MovimentacaoDialog'
import { useLocaisEstoque } from '../hooks'

function Origem({ m }: { m: MovimentacaoEstoque }) {
  const link = m.op
    ? { para: `/producao/ordens/${m.op.id}`, texto: m.op.numero }
    : m.pedido
      ? { para: `/pedidos/${m.pedido.id}`, texto: m.pedido.numero }
      : null
  return (
    <div className="min-w-0 text-xs">
      {link && (
        <Link to={link.para} className="font-medium text-marca-escuro hover:underline" onClick={(e) => e.stopPropagation()}>
          {link.texto}
        </Link>
      )}
      {m.entrada && <p className="font-medium">{m.entrada.numero}</p>}
      {m.motivo && <p className="truncate text-texto-secundario">{m.motivo}</p>}
    </div>
  )
}

/** Extrato de todas as movimentações, com filtros e CSV. /estoque/movimentacoes/novo abre o lançamento. */
export function MovimentacoesPage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const locais = useLocaisEstoque()
  const lista = useListagem<{ tipo?: string; localId?: string; de?: string; ate?: string }>({})
  const params = { ...lista.params, tipo: lista.filtros.tipo as TipoMovimentacao | undefined }
  const consulta = useQuery({ queryKey: ['estoque', 'movimentacoes', params], queryFn: () => estoqueApi.movimentacoes(params), placeholderData: keepPreviousData })
  const abertoPelaRota = pathname.endsWith('/novo')

  const colunas = useMemo<ColumnDef<MovimentacaoEstoque, unknown>[]>(
    () => [
      { id: 'data', header: 'Data', meta: { ordenavel: 'createdAt' }, cell: ({ row }) => <span className="whitespace-nowrap text-xs">{formatarDataHora(row.original.createdAt)}</span> },
      { id: 'tipo', header: 'Tipo', cell: ({ row }) => TIPO_MOVIMENTACAO_ROTULOS[row.original.tipo] },
      {
        id: 'produto',
        header: 'Produto',
        cell: ({ row: { original: m } }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{m.produto.nome}</p>
            <p className="text-xs text-texto-secundario">{m.local.nome}</p>
          </div>
        ),
      },
      {
        id: 'quantidade',
        header: 'Quantidade',
        meta: { className: 'text-right' },
        cell: ({ row: { original: m } }) => (
          <span className={cn('font-semibold', Number(m.quantidade) > 0 ? 'text-green-800' : 'text-coral-escuro')}>
            {Number(m.quantidade) > 0 ? '+' : ''}
            {formatarQuantidade(m.quantidade, m.produto.unidade)}
          </span>
        ),
      },
      { id: 'saldo', header: 'Saldo após', meta: { className: 'text-right', ocultarNoCard: true }, cell: ({ row: { original: m } }) => formatarQuantidade(m.saldoApos, m.produto.unidade) },
      { id: 'custo', header: 'Custo unit.', meta: { className: 'text-right', ocultarNoCard: true }, cell: ({ row }) => formatarMoeda(row.original.custoUnitario) },
      { id: 'origem', header: 'Origem / motivo', cell: ({ row }) => <Origem m={row.original} /> },
      { id: 'usuario', header: 'Usuário', meta: { ocultarNoCard: true }, cell: ({ row }) => row.original.usuario?.nome ?? '—' },
    ],
    [],
  )

  return (
    <>
      <PageHeader
        titulo="Movimentações"
        subtitulo="Tudo o que entrou e saiu do estoque, com o saldo resultante."
        acoes={
          <Can modulo="estoque" acao="criar">
            <Button onClick={() => navigate('/estoque/movimentacoes/novo')}>
              <ArrowLeftRight /> Nova movimentação
            </Button>
          </Can>
        }
      />
      <AbasNavegacao rotulo="Estoque" abas={ABAS_ESTOQUE} />
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
        idLinha={(m) => m.id}
        busca={{ valor: lista.busca, onChange: lista.setBusca, placeholder: 'Produto, motivo, OP ou pedido…' }}
        filtros={
          <div className="flex flex-wrap gap-2">
            <div className="w-48">
              <Select value={lista.filtros.tipo ?? ''} onChange={(e) => lista.setFiltro('tipo', e.target.value || undefined)} aria-label="Tipo">
                <option value="">Todos os tipos</option>
                {TIPOS_MOVIMENTACAO.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_MOVIMENTACAO_ROTULOS[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-40">
              <Select value={lista.filtros.localId ?? ''} onChange={(e) => lista.setFiltro('localId', e.target.value || undefined)} aria-label="Local">
                <option value="">Todos os locais</option>
                {locais.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </Select>
            </div>
            <Input type="date" className="w-40" value={lista.filtros.de ?? ''} onChange={(e) => lista.setFiltro('de', e.target.value || undefined)} aria-label="De" />
            <Input type="date" className="w-40" value={lista.filtros.ate ?? ''} onChange={(e) => lista.setFiltro('ate', e.target.value || undefined)} aria-label="Até" />
          </div>
        }
        exportar={{
          nomeArquivo: 'movimentacoes-estoque',
          buscarTodos: () => buscarTodasPaginas((page, pageSize) => estoqueApi.movimentacoes({ ...params, page, pageSize })),
          colunas: [
            { titulo: 'Data', valor: (m) => formatarDataHora(m.createdAt) },
            { titulo: 'Tipo', valor: (m) => TIPO_MOVIMENTACAO_ROTULOS[m.tipo] },
            { titulo: 'Produto', valor: (m) => m.produto.nome },
            { titulo: 'Local', valor: (m) => m.local.nome },
            { titulo: 'Quantidade', valor: (m) => Number(m.quantidade).toLocaleString('pt-BR') },
            { titulo: 'Saldo após', valor: (m) => Number(m.saldoApos).toLocaleString('pt-BR') },
            { titulo: 'Custo unitário', valor: (m) => Number(m.custoUnitario).toFixed(4).replace('.', ',') },
            { titulo: 'Origem', valor: (m) => m.op?.numero ?? m.pedido?.numero ?? m.entrada?.numero },
            { titulo: 'Motivo', valor: (m) => m.motivo },
            { titulo: 'Usuário', valor: (m) => m.usuario?.nome },
          ],
        }}
        vazio={{ titulo: 'Nenhuma movimentação', descricao: 'Registre uma entrada para começar a controlar o estoque.' }}
      />
      {abertoPelaRota && <MovimentacaoDialog onFechar={() => navigate('/estoque/movimentacoes', { replace: true })} />}
    </>
  )
}
