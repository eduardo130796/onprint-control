import { useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Modulo, Paginado } from '@onprint/shared'
import { AcaoIcone } from '@/components/shared/AcaoIcone'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { DataTable } from '@/components/shared/data-table/DataTable'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form-controls'
import { useListagem } from '@/hooks/useListagem'
import { usePermissoes } from '@/hooks/usePermission'
import { useMutacao } from '@/hooks/useMutacao'
import type { ColunaCsv } from '@/lib/csv'
import { buscarTodasPaginas } from '@/lib/paginacao'

interface Registro {
  id: string
  nome: string
  ativo: boolean
}

interface CadastroListaProps<T extends Registro> {
  /** Chave das queries (ex.: "acabamentos") */
  chave: string
  modulo: Modulo
  rotuloNovo: string
  api: {
    listar: (q: Record<string, unknown>) => Promise<Paginado<T>>
    desativar: (id: string) => Promise<unknown>
    reativar: (id: string) => Promise<unknown>
  }
  colunas: ColumnDef<T, unknown>[]
  csv?: { nomeArquivo: string; colunas: ColunaCsv<T>[] }
  buscaPlaceholder?: string
  /** Diálogo de criação/edição (registro undefined = novo) */
  dialogo: (registro: T | undefined, fechar: () => void) => ReactNode
  /** Caminho que abre o diálogo de criação pelo botão "+" (ex.: /produtos/acabamentos/novo) */
  caminhoNovo?: string
}

/** Lista padrão de cadastro: tabela, busca, filtro ativo/inativo, editar, desativar/reativar e CSV. */
export function CadastroLista<T extends Registro>(props: CadastroListaProps<T>) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pode = usePermissoes()
  const lista = useListagem<{ ativo: string }>({ ativo: 'true' })
  const consulta = useQuery({
    queryKey: [props.chave, 'lista', lista.params],
    queryFn: () => props.api.listar(lista.params),
    placeholderData: keepPreviousData,
  })
  const [editando, setEditando] = useState<T | 'novo' | null>(null)
  const [confirmar, setConfirmar] = useState<T | null>(null)
  const alterarAtivo = useMutacao([props.chave], (r: T) => (r.ativo ? props.api.desativar(r.id) : props.api.reativar(r.id)))
  const criandoPelaRota = Boolean(props.caminhoNovo && pathname === props.caminhoNovo)
  const aberto = criandoPelaRota ? 'novo' : editando

  const colunas = useMemo<ColumnDef<T, unknown>[]>(
    () => [
      ...props.colunas,
      {
        id: 'acoes',
        header: '',
        meta: { className: 'w-24 text-right' },
        cell: ({ row: { original: r } }) => (
          <div className="flex justify-end gap-1">
            {pode(props.modulo, 'editar') && <AcaoIcone icone={Pencil} rotulo="Editar" onClick={() => setEditando(r)} />}
            {pode(props.modulo, 'excluir') && (
              <AcaoIcone icone={r.ativo ? Trash2 : RotateCcw} rotulo={r.ativo ? 'Desativar' : 'Reativar'} perigo={r.ativo} onClick={() => setConfirmar(r)} />
            )}
          </div>
        ),
      },
    ],
    [props.colunas, props.modulo, pode],
  )

  function fechar() {
    setEditando(null)
    if (criandoPelaRota) navigate(pathname.replace(/\/novo$/, ''), { replace: true })
  }

  return (
    <>
      {pode(props.modulo, 'criar') && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setEditando('novo')}>
            <Plus /> {props.rotuloNovo}
          </Button>
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
        idLinha={(r) => r.id}
        onLinhaClick={pode(props.modulo, 'editar') ? (r) => setEditando(r) : undefined}
        busca={{ valor: lista.busca, onChange: lista.setBusca, placeholder: props.buscaPlaceholder ?? 'Buscar pelo nome…' }}
        filtros={
          <div className="w-36">
            <Select value={lista.filtros.ativo} onChange={(e) => lista.setFiltro('ativo', e.target.value)} aria-label="Cadastro">
              <option value="true">Ativos</option>
              <option value="false">Desativados</option>
              <option value="todos">Todos</option>
            </Select>
          </div>
        }
        exportar={
          props.csv && {
            ...props.csv,
            buscarTodos: () => buscarTodasPaginas((page, pageSize) => props.api.listar({ ...lista.params, page, pageSize })),
          }
        }
      />
      {aberto && props.dialogo(aberto === 'novo' ? undefined : aberto, fechar)}
      <ConfirmDialog
        aberto={Boolean(confirmar)}
        onAbertoChange={(v) => !v && setConfirmar(null)}
        titulo={confirmar?.ativo ? 'Desativar' : 'Reativar'}
        descricao={<>Confirma {confirmar?.ativo ? 'a desativação' : 'a reativação'} de <strong>{confirmar?.nome}</strong>?</>}
        textoConfirmar={confirmar?.ativo ? 'Desativar' : 'Reativar'}
        perigoso={confirmar?.ativo}
        onConfirmar={async () => {
          await alterarAtivo.mutateAsync(confirmar!)
          toast.success('Cadastro atualizado.')
        }}
      />
    </>
  )
}

export function BadgeInativo({ ativo }: { ativo: boolean }) {
  return ativo ? null : <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">Desativado</span>
}
