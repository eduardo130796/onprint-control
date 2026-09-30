import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowLeftRight, MapPin, PackagePlus } from 'lucide-react'
import { SITUACOES_ESTOQUE, SITUACAO_ESTOQUE_ROTULOS, formatarData, formatarMoeda, type PosicaoEstoque, type SituacaoEstoque } from '@onprint/shared'
import { estoqueApi } from '@/api/estoque'
import { ABAS_ESTOQUE } from '@/app/abas'
import { PageHeader } from '@/components/layout/PageHeader'
import { AbasNavegacao } from '@/components/shared/AbasNavegacao'
import { Can } from '@/components/shared/Can'
import { DataTable } from '@/components/shared/data-table/DataTable'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form-controls'
import { useListagem } from '@/hooks/useListagem'
import { buscarTodasPaginas } from '@/lib/paginacao'
import { formatarQuantidade } from '@/lib/quantidade'
import { cn } from '@/lib/utils'
import { KardexDialog } from '../components/KardexDialog'
import { LocaisDialog } from '../components/LocaisDialog'
import { MovimentacaoDialog } from '../components/MovimentacaoDialog'
import { SeloSituacao } from '../components/SeloSituacao'
import { useLocaisEstoque } from '../hooks'

/** Sugestão de compra: repor até o dobro do mínimo. */
const sugestao = (l: PosicaoEstoque) => Math.max(0, Number(l.estoqueMinimo) * 2 - Number(l.saldo))

/** Estoque atual (/estoque) e Alertas de estoque baixo (/estoque/alertas, com `alertas`). */
export function EstoquePage({ alertas = false }: { alertas?: boolean }) {
  const navigate = useNavigate()
  const locais = useLocaisEstoque()
  const lista = useListagem<{ localId?: string; situacao?: string }>({})
  const params = { ...lista.params, situacao: lista.filtros.situacao as SituacaoEstoque | undefined, alertas: alertas ? ('true' as const) : undefined }
  const consulta = useQuery({ queryKey: ['estoque', 'posicao', params], queryFn: () => estoqueApi.posicao(params), placeholderData: keepPreviousData })
  const [kardex, setKardex] = useState<{ id: string; nome: string } | null>(null)
  const [dialogo, setDialogo] = useState<'locais' | 'movimentar' | null>(null)

  const colunas = useMemo<ColumnDef<PosicaoEstoque, unknown>[]>(
    () => [
      {
        id: 'nome',
        header: 'Produto',
        meta: { ordenavel: 'nome' },
        cell: ({ row: { original: l } }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{l.produto.nome}</p>
            <p className="font-mono text-xs text-texto-secundario">{l.produto.codigo}</p>
          </div>
        ),
      },
      {
        id: 'saldo',
        header: 'Saldo',
        meta: { ordenavel: 'saldo', className: 'text-right' },
        cell: ({ row: { original: l } }) => <span className={cn('font-semibold', l.situacao !== 'ok' && 'text-coral-escuro')}>{formatarQuantidade(l.saldo, l.produto.unidade)}</span>,
      },
      { id: 'minimo', header: 'Mínimo', meta: { className: 'text-right' }, cell: ({ row: { original: l } }) => formatarQuantidade(l.estoqueMinimo, l.produto.unidade) },
      ...(alertas
        ? [{ id: 'sugestao', header: 'Comprar (sugestão)', meta: { className: 'text-right' }, cell: ({ row: { original: l } }) => <span className="font-medium">{formatarQuantidade(sugestao(l), l.produto.unidade)}</span> } as ColumnDef<PosicaoEstoque, unknown>]
        : [
            { id: 'custo', header: 'Custo médio', meta: { className: 'text-right', ocultarNoCard: true }, cell: ({ row }) => formatarMoeda(row.original.custoMedio) } as ColumnDef<PosicaoEstoque, unknown>,
            { id: 'valor', header: 'Valor em estoque', meta: { ordenavel: 'valor', className: 'text-right', ocultarNoCard: true }, cell: ({ row }) => formatarMoeda(row.original.valorEstoque) } as ColumnDef<PosicaoEstoque, unknown>,
          ]),
      { id: 'situacao', header: 'Situação', cell: ({ row }) => <SeloSituacao situacao={row.original.situacao} /> },
      { id: 'ultima', header: 'Última mov.', meta: { ocultarNoCard: true }, cell: ({ row }) => (row.original.ultimaMovimentacao ? formatarData(row.original.ultimaMovimentacao) : '—') },
    ],
    [alertas],
  )

  return (
    <>
      <PageHeader
        titulo={alertas ? 'Alertas de estoque baixo' : 'Estoque atual'}
        subtitulo={alertas ? 'Itens com saldo igual ou abaixo do mínimo. A sugestão repõe até o dobro do mínimo.' : 'O saldo só muda por movimentação: entradas, produção, ajustes e perdas.'}
        acoes={
          <>
            <Button variant="outline" onClick={() => setDialogo('locais')}>
              <MapPin /> Locais
            </Button>
            <Can modulo="estoque" acao="criar">
              <Button variant="outline" onClick={() => setDialogo('movimentar')}>
                <ArrowLeftRight /> Movimentar
              </Button>
              <Button onClick={() => navigate('/estoque/entradas/novo')}>
                <PackagePlus /> Nova entrada
              </Button>
            </Can>
          </>
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
        idLinha={(l) => l.produto.id}
        onLinhaClick={(l) => setKardex({ id: l.produto.id, nome: l.produto.nome })}
        busca={{ valor: lista.busca, onChange: lista.setBusca, placeholder: 'Nome ou código…' }}
        filtros={
          <div className="flex flex-wrap gap-2">
            <div className="w-44">
              <Select value={lista.filtros.localId ?? ''} onChange={(e) => lista.setFiltro('localId', e.target.value || undefined)} aria-label="Local">
                <option value="">Todos os locais</option>
                {locais.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </Select>
            </div>
            {!alertas && (
              <div className="w-44">
                <Select value={lista.filtros.situacao ?? ''} onChange={(e) => lista.setFiltro('situacao', e.target.value || undefined)} aria-label="Situação">
                  <option value="">Todas as situações</option>
                  {SITUACOES_ESTOQUE.map((s) => (
                    <option key={s} value={s}>
                      {SITUACAO_ESTOQUE_ROTULOS[s]}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        }
        exportar={{
          nomeArquivo: alertas ? 'estoque-baixo' : 'estoque',
          buscarTodos: () => buscarTodasPaginas((page, pageSize) => estoqueApi.posicao({ ...params, page, pageSize })),
          colunas: [
            { titulo: 'Código', valor: (l) => l.produto.codigo },
            { titulo: 'Produto', valor: (l) => l.produto.nome },
            { titulo: 'Unidade', valor: (l) => l.produto.unidade },
            { titulo: 'Saldo', valor: (l) => Number(l.saldo).toLocaleString('pt-BR') },
            { titulo: 'Mínimo', valor: (l) => Number(l.estoqueMinimo).toLocaleString('pt-BR') },
            { titulo: 'Custo médio', valor: (l) => Number(l.custoMedio).toFixed(4).replace('.', ',') },
            { titulo: 'Valor em estoque', valor: (l) => Number(l.valorEstoque).toFixed(2).replace('.', ',') },
            { titulo: 'Situação', valor: (l) => SITUACAO_ESTOQUE_ROTULOS[l.situacao] },
          ],
        }}
        vazio={
          alertas
            ? { titulo: 'Nenhum alerta', descricao: 'Todos os itens estão acima do estoque mínimo.' }
            : { titulo: 'Nenhum item controla estoque', descricao: 'Marque “Controlar estoque” na aba Estoque do cadastro do produto.' }
        }
      />
      <KardexDialog produto={kardex} onFechar={() => setKardex(null)} />
      <LocaisDialog aberto={dialogo === 'locais'} onFechar={() => setDialogo(null)} />
      {dialogo === 'movimentar' && <MovimentacaoDialog onFechar={() => setDialogo(null)} />}
    </>
  )
}

export function AlertasEstoquePage() {
  return <EstoquePage alertas />
}
