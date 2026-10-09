import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { KeyRound, Pencil, Plus, UserX } from 'lucide-react'
import { toast } from 'sonner'
import { formatarDataHora, iniciais, type UsuarioResumo } from '@onprint/shared'
import { usuariosApi } from '@/api/configuracoes'
import { PageHeader } from '@/components/layout/PageHeader'
import { AcaoIcone } from '@/components/shared/AcaoIcone'
import { Can } from '@/components/shared/Can'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { DataTable } from '@/components/shared/data-table/DataTable'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form-controls'
import { useAuth } from '@/hooks/useAuth'
import { useListagem } from '@/hooks/useListagem'
import { usePermissoes } from '@/hooks/usePermission'
import { RedefinirSenhaDialog } from '../components/RedefinirSenhaDialog'
import { UsuarioDialog } from '../components/UsuarioDialog'

type FiltroAtivo = 'true' | 'false' | 'todos'

export function UsuariosPage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { usuario: logado } = useAuth()
  const pode = usePermissoes()
  const queryClient = useQueryClient()
  const lista = useListagem<{ ativo: string }>({ ativo: 'todos' })
  const params = { ...lista.params, ativo: lista.filtros.ativo as FiltroAtivo }
  const consulta = useQuery({ queryKey: ['usuarios', 'lista', params], queryFn: () => usuariosApi.listar(params), placeholderData: keepPreviousData })
  const [editando, setEditando] = useState<UsuarioResumo | null>(null)
  const [senhaDe, setSenhaDe] = useState<UsuarioResumo | null>(null)
  const [desativando, setDesativando] = useState<UsuarioResumo | null>(null)
  // /configuracoes/usuarios/novo (botão "+") abre o diálogo de criação
  const criando = pathname.endsWith('/novo')
  const desativar = useMutation({
    mutationFn: (id: string) => usuariosApi.desativar(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['usuarios'] }),
  })

  const colunas = useMemo<ColumnDef<UsuarioResumo, unknown>[]>(
    () => [
      {
        id: 'nome',
        header: 'Usuário',
        meta: { ordenavel: 'nome' },
        cell: ({ row: { original: u } }) => (
          <div className="flex items-center gap-3">
            <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-tinta md:flex">
              {iniciais(u.nome)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{u.nome}</p>
              <p className="truncate text-xs text-texto-secundario">{u.email}</p>
            </div>
          </div>
        ),
      },
      { id: 'papel', header: 'Papel', cell: ({ row }) => row.original.papel.nome },
      { id: 'ultimoLogin', header: 'Último acesso', meta: { ordenavel: 'ultimoLogin' }, cell: ({ row }) => formatarDataHora(row.original.ultimoLogin) },
      {
        id: 'situacao',
        header: 'Situação',
        cell: ({ row: { original: u } }) => (
          <div className="flex flex-wrap justify-end gap-1 md:justify-start">
            <span className={u.ativo ? 'rounded-full bg-verde/15 px-2 py-0.5 text-xs font-medium text-green-800' : 'rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600'}>
              {u.ativo ? 'Ativo' : 'Desativado'}
            </span>
            {u.deveTrocarSenha && <span className="rounded-full bg-ambar/15 px-2 py-0.5 text-xs text-amber-800">Senha provisória</span>}
          </div>
        ),
      },
      {
        id: 'acoes',
        header: '',
        meta: { className: 'w-32 text-right' },
        cell: ({ row: { original: u } }) => (
          <div className="flex justify-end gap-1">
            {pode('usuarios', 'editar') && (
              <>
                <AcaoIcone icone={Pencil} rotulo="Editar" onClick={() => setEditando(u)} />
                <AcaoIcone icone={KeyRound} rotulo="Redefinir senha" onClick={() => setSenhaDe(u)} />
              </>
            )}
            {pode('usuarios', 'excluir') && u.ativo && u.id !== logado?.id && (
              <AcaoIcone icone={UserX} rotulo="Desativar" perigo onClick={() => setDesativando(u)} />
            )}
          </div>
        ),
      },
    ],
    [pode, logado?.id],
  )

  return (
    <>
      <PageHeader
        titulo="Usuários"
        subtitulo="Quem acessa o sistema e com qual papel."
        acoes={
          <Can modulo="usuarios" acao="criar">
            <Button onClick={() => navigate('/configuracoes/usuarios/novo')}>
              <Plus /> Novo usuário
            </Button>
          </Can>
        }
      />
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
        idLinha={(u) => u.id}
        busca={{ valor: lista.busca, onChange: lista.setBusca, placeholder: 'Nome ou e-mail…' }}
        filtros={
          <div className="w-36">
            <Select value={lista.filtros.ativo} onChange={(e) => lista.setFiltro('ativo', e.target.value)} aria-label="Situação">
              <option value="todos">Todos</option>
              <option value="true">Ativos</option>
              <option value="false">Desativados</option>
            </Select>
          </div>
        }
      />

      {(criando || editando) && (
        <UsuarioDialog
          usuario={editando ?? undefined}
          onFechar={() => {
            setEditando(null)
            if (criando) navigate('/configuracoes/usuarios', { replace: true })
          }}
        />
      )}
      {senhaDe && <RedefinirSenhaDialog usuario={senhaDe} onFechar={() => setSenhaDe(null)} />}
      <ConfirmDialog
        aberto={Boolean(desativando)}
        onAbertoChange={(v) => !v && setDesativando(null)}
        titulo="Desativar usuário"
        descricao={<><strong>{desativando?.nome}</strong> perde o acesso imediatamente e as sessões abertas são encerradas.</>}
        textoConfirmar="Desativar"
        perigoso
        onConfirmar={async () => {
          await desativar.mutateAsync(desativando!.id)
          toast.success('Usuário desativado.')
        }}
      />
    </>
  )
}
