import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { formatarDataHora, formatarMoeda, type CaixaSessao } from '@onprint/shared'
import { caixaApi } from '@/api/financeiro'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable } from '@/components/shared/data-table/DataTable'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useListagem } from '@/hooks/useListagem'
import { cn } from '@/lib/utils'
import { ListaMovimentosCaixa, ResumoFormas } from '../components/ListaMovimentosCaixa'
import { TelaDeCaixa } from '../components/CabecalhoCaixa'

function SessaoDialog({ id, onFechar }: { id: string | null; onFechar: () => void }) {
  const consulta = useQuery({ queryKey: ['caixa', 'sessao', id], queryFn: () => caixaApi.sessao(id!), enabled: Boolean(id) })
  const s = consulta.data
  return (
    <Dialog open={Boolean(id)} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="top-[5%] max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogTitle>Caixa {s?.numero}</DialogTitle>
        <DialogDescription>
          {s ? `${s.usuario.nome} · ${formatarDataHora(s.abertaEm)}${s.fechadaEm ? ` a ${formatarDataHora(s.fechadaEm)}` : ' · aberto'}` : 'Carregando…'}
        </DialogDescription>
        {consulta.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : consulta.isError || !s ? (
          <EstadoErro erro={consulta.error} />
        ) : (
          <div className="space-y-4 text-sm">
            <p>
              Troco inicial {formatarMoeda(s.valorAbertura)} · {s.vendas.quantidade} venda(s), {formatarMoeda(s.vendas.total)}
              {s.diferenca !== null && (
                <span className={cn('ml-2 font-medium', Number(s.diferenca) === 0 ? 'text-green-800' : 'text-coral-escuro')}>diferença no fechamento {formatarMoeda(s.diferenca)}</span>
              )}
            </p>
            <ResumoFormas porForma={s.porForma} conferencia={s.conferencia} />
            {s.observacao && <p className="rounded-lg bg-fundo p-2">{s.observacao}</p>}
            <ListaMovimentosCaixa movimentos={s.movimentos} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Histórico de sessões de caixa (/caixa/sessoes). */
export function SessoesPage() {
  const lista = useListagem<Record<string, string | undefined>>({})
  const consulta = useQuery({ queryKey: ['caixa', 'sessoes', lista.params], queryFn: () => caixaApi.sessoes(lista.params), placeholderData: keepPreviousData })
  const [aberta, setAberta] = useState<string | null>(null)
  const colunas = useMemo<ColumnDef<CaixaSessao, unknown>[]>(
    () => [
      { id: 'numero', header: 'Caixa', meta: { ordenavel: 'numero' }, cell: ({ row }) => <span className="font-mono text-xs">{row.original.numero}</span> },
      { id: 'operador', header: 'Operador', cell: ({ row }) => row.original.usuario.nome },
      { id: 'abertura', header: 'Abertura', meta: { ordenavel: 'abertaEm' }, cell: ({ row }) => formatarDataHora(row.original.abertaEm) },
      { id: 'fechamento', header: 'Fechamento', cell: ({ row }) => (row.original.fechadaEm ? formatarDataHora(row.original.fechadaEm) : <span className="font-medium text-marca-escuro">aberto</span>) },
      { id: 'total', header: 'Total conferido', meta: { className: 'text-right' }, cell: ({ row }) => (row.original.totalInformado ? formatarMoeda(row.original.totalInformado) : '—') },
      {
        id: 'dif',
        header: 'Diferença',
        meta: { className: 'text-right' },
        cell: ({ row: { original: s } }) =>
          s.diferenca === null ? '—' : <span className={cn('font-medium', Number(s.diferenca) === 0 ? 'text-green-800' : 'text-coral-escuro')}>{formatarMoeda(s.diferenca)}</span>,
      },
    ],
    [],
  )
  return (
    <>
      <PageHeader titulo="Histórico de sessões" subtitulo="Aberturas, fechamentos e a conferência de cada caixa." />
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
        idLinha={(s) => s.id}
        onLinhaClick={(s) => setAberta(s.id)}
        vazio={{ titulo: 'Nenhuma sessão ainda', descricao: 'As sessões aparecem aqui quando o caixa é aberto.' }}
      />
      <SessaoDialog id={aberta} onFechar={() => setAberta(null)} />
    </>
  )
}

/** Sangria e suprimento (/caixa/movimentos): resumo da gaveta e movimentos da sessão aberta. */
export function MovimentosCaixaPage() {
  return (
    <TelaDeCaixa titulo="Sangria e suprimento" subtitulo="Abra o caixa para movimentar a gaveta.">
      {(s) => (
        <div className="space-y-4">
          <ResumoFormas porForma={s.porForma} />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Movimentos deste caixa</CardTitle>
            </CardHeader>
            <CardContent>
              <ListaMovimentosCaixa movimentos={s.movimentos} />
            </CardContent>
          </Card>
        </div>
      )}
    </TelaDeCaixa>
  )
}
