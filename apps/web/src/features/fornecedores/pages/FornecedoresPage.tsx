import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatarCpfCnpj, formatarTelefone, type Fornecedor } from '@onprint/shared'
import { fornecedoresApi } from '@/api/cadastros'
import { PageHeader } from '@/components/layout/PageHeader'
import { AcaoIcone } from '@/components/shared/AcaoIcone'
import { Can } from '@/components/shared/Can'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { buscarTodasPaginas } from '@/lib/paginacao'
import { DataTable } from '@/components/shared/data-table/DataTable'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form-controls'
import { useListagem } from '@/hooks/useListagem'
import { usePermission } from '@/hooks/usePermission'
import { useFornecedores, useMutacaoFornecedores } from '../hooks'

type FiltroAtivo = 'true' | 'false' | 'todos'

export function FornecedoresPage() {
  const navigate = useNavigate()
  const lista = useListagem<{ ativo: string }>({ ativo: 'true' })
  const params = { ...lista.params, ativo: lista.filtros.ativo as FiltroAtivo }
  const consulta = useFornecedores(params)
  const podeExcluir = usePermission('fornecedores', 'excluir')
  const [confirmar, setConfirmar] = useState<Fornecedor | null>(null)
  const alterarAtivo = useMutacaoFornecedores((f: Fornecedor) => (f.ativo ? fornecedoresApi.desativar(f.id) : fornecedoresApi.reativar(f.id)))

  const colunas = useMemo<ColumnDef<Fornecedor, unknown>[]>(
    () => [
      {
        id: 'nome',
        header: 'Fornecedor',
        meta: { ordenavel: 'nome' },
        cell: ({ row: { original: f } }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{f.nome}</p>
            {f.fantasia && <p className="truncate text-xs text-texto-secundario">{f.fantasia}</p>}
          </div>
        ),
      },
      { id: 'categoria', header: 'Fornece', meta: { ordenavel: 'categoriaFornecimento' }, cell: ({ row }) => row.original.categoriaFornecimento ?? '—' },
      { id: 'documento', header: 'CPF/CNPJ', cell: ({ row }) => formatarCpfCnpj(row.original.cpfCnpj) || '—' },
      {
        id: 'contato',
        header: 'Contato',
        cell: ({ row: { original: f } }) => [f.contato, formatarTelefone(f.whatsapp ?? f.telefone)].filter(Boolean).join(' · ') || '—',
      },
      { id: 'prazo', header: 'Prazo médio', cell: ({ row }) => (row.original.prazoMedioDias != null ? `${row.original.prazoMedioDias} dias` : '—') },
      {
        id: 'acoes',
        header: '',
        meta: { className: 'w-24 text-right' },
        cell: ({ row: { original: f } }) => (
          <div className="flex justify-end gap-1">
            <AcaoIcone icone={Pencil} rotulo="Abrir" onClick={() => navigate(`/fornecedores/${f.id}`)} />
            {podeExcluir && (
              <AcaoIcone icone={f.ativo ? Trash2 : RotateCcw} rotulo={f.ativo ? 'Desativar' : 'Reativar'} perigo={f.ativo} onClick={() => setConfirmar(f)} />
            )}
          </div>
        ),
      },
    ],
    [navigate, podeExcluir],
  )

  return (
    <>
      <PageHeader
        titulo="Fornecedores"
        acoes={
          <Can modulo="fornecedores" acao="criar">
            <Button onClick={() => navigate('/fornecedores/novo')}>
              <Plus /> Novo fornecedor
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
        idLinha={(f) => f.id}
        onLinhaClick={(f) => navigate(`/fornecedores/${f.id}`)}
        busca={{ valor: lista.busca, onChange: lista.setBusca, placeholder: 'Nome, CNPJ, o que fornece…' }}
        filtros={
          <div className="w-36">
            <Select value={lista.filtros.ativo} onChange={(e) => lista.setFiltro('ativo', e.target.value)} aria-label="Cadastro">
              <option value="true">Ativos</option>
              <option value="false">Desativados</option>
              <option value="todos">Todos</option>
            </Select>
          </div>
        }
        exportar={{
          nomeArquivo: 'fornecedores',
          buscarTodos: () => buscarTodasPaginas((page, pageSize) => fornecedoresApi.listar({ ...params, page, pageSize })),
          colunas: [
            { titulo: 'Nome', valor: (f) => f.nome },
            { titulo: 'Fantasia', valor: (f) => f.fantasia },
            { titulo: 'CPF/CNPJ', valor: (f) => formatarCpfCnpj(f.cpfCnpj) },
            { titulo: 'Fornece', valor: (f) => f.categoriaFornecimento },
            { titulo: 'Contato', valor: (f) => f.contato },
            { titulo: 'Telefone', valor: (f) => formatarTelefone(f.telefone ?? f.whatsapp) },
            { titulo: 'E-mail', valor: (f) => f.email },
            { titulo: 'Prazo médio (dias)', valor: (f) => f.prazoMedioDias },
          ],
        }}
        vazio={{ titulo: 'Nenhum fornecedor encontrado' }}
      />
      <ConfirmDialog
        aberto={Boolean(confirmar)}
        onAbertoChange={(v) => !v && setConfirmar(null)}
        titulo={confirmar?.ativo ? 'Desativar fornecedor' : 'Reativar fornecedor'}
        descricao={<>Confirma a alteração de <strong>{confirmar?.nome}</strong>?</>}
        textoConfirmar={confirmar?.ativo ? 'Desativar' : 'Reativar'}
        perigoso={confirmar?.ativo}
        onConfirmar={async () => {
          await alterarAtivo.mutateAsync(confirmar!)
          toast.success('Fornecedor atualizado.')
        }}
      />
    </>
  )
}
