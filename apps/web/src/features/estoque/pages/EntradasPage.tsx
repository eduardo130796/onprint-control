import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { PackagePlus } from 'lucide-react'
import { formatarDataHora, formatarDataSimples, formatarMoeda, type EntradaEstoque } from '@onprint/shared'
import { estoqueApi } from '@/api/estoque'
import { ABAS_ESTOQUE } from '@/app/abas'
import { PageHeader } from '@/components/layout/PageHeader'
import { AbasNavegacao } from '@/components/shared/AbasNavegacao'
import { Can } from '@/components/shared/Can'
import { DataTable } from '@/components/shared/data-table/DataTable'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useListagem } from '@/hooks/useListagem'
import { buscarTodasPaginas } from '@/lib/paginacao'
import { formatarQuantidade } from '@/lib/quantidade'

function EntradaDialog({ id, onFechar }: { id: string | null; onFechar: () => void }) {
  const consulta = useQuery({ queryKey: ['estoque', 'entrada', id], queryFn: () => estoqueApi.entrada(id!), enabled: Boolean(id) })
  const e = consulta.data
  return (
    <Dialog open={Boolean(id)} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Entrada {e?.numero}</DialogTitle>
        <DialogDescription>
          {e ? `${formatarDataSimples(e.dataEntrada)} · ${e.local.nome}${e.fornecedor ? ` · ${e.fornecedor.nome}` : ''}${e.notaFiscal ? ` · NF ${e.notaFiscal}` : ''}` : 'Carregando…'}
        </DialogDescription>
        {consulta.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : consulta.isError ? (
          <EstadoErro erro={consulta.error} />
        ) : (
          <div className="space-y-3 text-sm">
            <table className="w-full">
              <thead className="border-b border-border text-left text-xs uppercase text-texto-secundario">
                <tr>
                  <th className="py-2">Produto</th>
                  <th className="py-2 text-right">Quantidade</th>
                  <th className="py-2 text-right">Custo unit.</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {consulta.data.itens.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2">{i.produto.nome}</td>
                    <td className="py-2 text-right">{formatarQuantidade(i.quantidade, i.produto.unidade)}</td>
                    <td className="py-2 text-right">{Number(i.custoUnitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 4 })}</td>
                    <td className="py-2 text-right font-medium">{formatarMoeda(i.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-right text-base font-semibold text-grafite">Total {formatarMoeda(consulta.data.total)}</p>
            {consulta.data.observacoes && <p className="rounded-lg bg-fundo p-3">{consulta.data.observacoes}</p>}
            <p className="text-xs text-texto-secundario">
              Registrada por {consulta.data.usuario?.nome ?? '—'} em {formatarDataHora(consulta.data.createdAt)}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Entradas de estoque (notas de fornecedor). */
export function EntradasPage() {
  const navigate = useNavigate()
  const lista = useListagem<Record<string, string | undefined>>({})
  const [aberta, setAberta] = useState<string | null>(null)
  const params = lista.params
  const consulta = useQuery({ queryKey: ['estoque', 'entradas', params], queryFn: () => estoqueApi.entradas(params), placeholderData: keepPreviousData })

  const colunas = useMemo<ColumnDef<EntradaEstoque, unknown>[]>(
    () => [
      { id: 'numero', header: 'Número', meta: { ordenavel: 'numero' }, cell: ({ row }) => <span className="font-mono text-xs">{row.original.numero}</span> },
      { id: 'data', header: 'Data', meta: { ordenavel: 'dataEntrada' }, cell: ({ row }) => formatarDataSimples(row.original.dataEntrada) },
      {
        id: 'fornecedor',
        header: 'Fornecedor',
        cell: ({ row: { original: e } }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{e.fornecedor?.nome ?? 'Sem fornecedor'}</p>
            {e.notaFiscal && <p className="text-xs text-texto-secundario">NF {e.notaFiscal}</p>}
          </div>
        ),
      },
      { id: 'local', header: 'Local', meta: { ocultarNoCard: true }, cell: ({ row }) => row.original.local.nome },
      { id: 'itens', header: 'Itens', meta: { className: 'text-right' }, cell: ({ row }) => row.original.itensCount ?? 0 },
      { id: 'total', header: 'Total', meta: { ordenavel: 'total', className: 'text-right' }, cell: ({ row }) => <span className="font-medium">{formatarMoeda(row.original.total)}</span> },
      { id: 'usuario', header: 'Registrada por', meta: { ocultarNoCard: true }, cell: ({ row }) => row.original.usuario?.nome ?? '—' },
    ],
    [],
  )

  return (
    <>
      <PageHeader
        titulo="Entradas de estoque"
        subtitulo="Cada item da nota entra no saldo e recalcula o custo médio."
        acoes={
          <Can modulo="estoque" acao="criar">
            <Button onClick={() => navigate('/estoque/entradas/novo')}>
              <PackagePlus /> Nova entrada
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
        idLinha={(e) => e.id}
        onLinhaClick={(e) => setAberta(e.id)}
        busca={{ valor: lista.busca, onChange: lista.setBusca, placeholder: 'Número, NF ou fornecedor…' }}
        exportar={{
          nomeArquivo: 'entradas-estoque',
          buscarTodos: () => buscarTodasPaginas((page, pageSize) => estoqueApi.entradas({ ...params, page, pageSize })),
          colunas: [
            { titulo: 'Número', valor: (e) => e.numero },
            { titulo: 'Data', valor: (e) => formatarDataSimples(e.dataEntrada) },
            { titulo: 'Fornecedor', valor: (e) => e.fornecedor?.nome },
            { titulo: 'NF', valor: (e) => e.notaFiscal },
            { titulo: 'Local', valor: (e) => e.local.nome },
            { titulo: 'Total', valor: (e) => Number(e.total).toFixed(2).replace('.', ',') },
          ],
        }}
        vazio={{ titulo: 'Nenhuma entrada', descricao: 'Registre a nota do fornecedor para dar entrada no estoque.' }}
      />
      <EntradaDialog id={aberta} onFechar={() => setAberta(null)} />
    </>
  )
}
