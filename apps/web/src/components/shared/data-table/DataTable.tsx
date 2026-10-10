import type { ReactNode } from 'react'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, Search } from 'lucide-react'
import type { Paginado } from '@onprint/shared'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { ColunaCsv } from '@/lib/csv'
import { cn } from '@/lib/utils'
import { EmptyState } from '../EmptyState'
import { EstadoErro } from '../EstadoErro'
import { BotaoExportarCsv } from './BotaoExportarCsv'
import { Paginacao } from './Paginacao'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** Campo aceito pela API em ?sort=campo:asc */
    ordenavel?: string
    /** Esconde a coluna no modo card (celular) */
    ocultarNoCard?: boolean
    /** Coluna secundária: só aparece na tabela a partir desta largura (no cartão do celular continua) */
    apartirDe?: 'lg' | 'xl' | '2xl'
    className?: string
  }
}

export interface DataTableProps<T> {
  colunas: ColumnDef<T, unknown>[]
  resultado?: Paginado<T>
  carregando: boolean
  erro?: unknown
  onTentarNovamente?: () => void
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  sort?: string
  onSortChange?: (sort: string | undefined) => void
  busca?: { valor: string; onChange: (v: string) => void; placeholder?: string }
  /** Filtros extras exibidos ao lado da busca */
  filtros?: ReactNode
  exportar?: { nomeArquivo: string; colunas: ColunaCsv<T>[]; buscarTodos: () => Promise<T[]> }
  /** Clique na linha; o evento permite Ctrl/Cmd+clique (abrir em nova aba) */
  onLinhaClick?: (linha: T, evento: React.MouseEvent) => void
  destacarLinha?: (linha: T) => boolean
  vazio?: { titulo: string; descricao?: string; acao?: ReactNode }
  idLinha?: (linha: T) => string
}

// Classes completas (o Tailwind só gera o que aparece escrito no código)
const VISIVEL: Record<string, string> = { lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell', '2xl': 'hidden 2xl:table-cell' }

/** Tabela genérica: paginação e ordenação no servidor, busca, filtros, CSV e cards no celular. */
export function DataTable<T>(props: DataTableProps<T>) {
  const { colunas, resultado, carregando, erro, busca, filtros, exportar, onLinhaClick, destacarLinha } = props
  const tabela = useReactTable({
    data: resultado?.data ?? [],
    columns: colunas,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    getRowId: props.idLinha,
  })

  function alternarOrdem(campo: string) {
    const [atual, dir] = (props.sort ?? '').split(':')
    if (atual !== campo) props.onSortChange?.(`${campo}:asc`)
    else props.onSortChange?.(dir === 'asc' ? `${campo}:desc` : undefined)
  }

  const linhas = tabela.getRowModel().rows
  const cabecalhos = tabela.getHeaderGroups()[0]?.headers ?? []

  return (
    <Card className="overflow-hidden">
      {(busca || filtros || exportar) && (
        <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center">
          {busca && (
            <div className="relative md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-secundario" />
              <Input
                value={busca.valor}
                onChange={(e) => busca.onChange(e.target.value)}
                placeholder={busca.placeholder ?? 'Buscar…'}
                className="pl-9"
                aria-label="Buscar"
              />
            </div>
          )}
          {filtros && <div className="flex flex-1 flex-wrap items-center gap-2">{filtros}</div>}
          {exportar && (
            <div className="md:ml-auto">
              <BotaoExportarCsv {...exportar} />
            </div>
          )}
        </div>
      )}

      {erro ? (
        <EstadoErro erro={erro} onTentarNovamente={props.onTentarNovamente} />
      ) : carregando && !resultado ? (
        <div className="space-y-3 p-4" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : linhas.length === 0 ? (
        <EmptyState icone={Inbox} titulo={props.vazio?.titulo ?? 'Nenhum registro encontrado'} descricao={props.vazio?.descricao} acao={props.vazio?.acao} />
      ) : (
        <div className={cn(carregando && 'opacity-60 transition-opacity')}>
          {/* Desktop: tabela (a partir de 1024 px) */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead className="bg-fundo/60 text-left text-xs uppercase tracking-wide text-texto-secundario">
                <tr>
                  {cabecalhos.map((h) => {
                    const campo = h.column.columnDef.meta?.ordenavel
                    const [atual, dir] = (props.sort ?? '').split(':')
                    const Icone = atual === campo ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
                    return (
                      <th key={h.id} className={cn('whitespace-nowrap px-4 py-3 font-medium', VISIVEL[h.column.columnDef.meta?.apartirDe ?? ''], h.column.columnDef.meta?.className)}>
                        {campo && props.onSortChange ? (
                          <button type="button" onClick={() => alternarOrdem(campo)} className="inline-flex items-center gap-1 uppercase hover:text-tinta">
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            <Icone className={cn('h-3.5 w-3.5', atual !== campo && 'opacity-40')} />
                          </button>
                        ) : (
                          flexRender(h.column.columnDef.header, h.getContext())
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhas.map((linha) => (
                  <tr
                    key={linha.id}
                    onClick={onLinhaClick ? (e) => onLinhaClick(linha.original, e) : undefined}
                    className={cn(
                      'transition-colors hover:bg-fundo/70',
                      onLinhaClick && 'cursor-pointer',
                      destacarLinha?.(linha.original) && 'bg-ambar/5 shadow-[inset_3px_0_0_#F59E0B]',
                    )}
                  >
                    {linha.getVisibleCells().map((c) => (
                      <td key={c.id} className={cn('px-4 py-3 align-middle', c.column.columnDef.meta?.className?.includes('text-right') && 'whitespace-nowrap tabular-nums', VISIVEL[c.column.columnDef.meta?.apartirDe ?? ''], c.column.columnDef.meta?.className)}>
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Celular: cartões; tablet: cartões em duas colunas */}
          <ul className="divide-y divide-border md:grid md:grid-cols-2 md:divide-y-0 lg:hidden">
            {linhas.map((linha) => (
              <li
                key={linha.id}
                onClick={onLinhaClick ? (e) => onLinhaClick(linha.original, e) : undefined}
                className={cn('space-y-1.5 p-4 md:border-b md:border-border md:odd:border-r', onLinhaClick && 'cursor-pointer', destacarLinha?.(linha.original) && 'bg-ambar/5 shadow-[inset_3px_0_0_#F59E0B]')}
              >
                {linha.getVisibleCells().filter((c) => !c.column.columnDef.meta?.ocultarNoCard).map((c) => {
                  const titulo = c.column.columnDef.header
                  return (
                    <div key={c.id} className="flex items-start justify-between gap-3 text-sm">
                      {typeof titulo === 'string' && titulo && <span className="shrink-0 text-xs text-texto-secundario">{titulo}</span>}
                      <div className="min-w-0 text-right">{flexRender(c.column.columnDef.cell, c.getContext())}</div>
                    </div>
                  )
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {resultado && resultado.meta.total > 0 && (
        <Paginacao meta={resultado.meta} onPageChange={props.onPageChange} onPageSizeChange={props.onPageSizeChange} />
      )}
    </Card>
  )
}
