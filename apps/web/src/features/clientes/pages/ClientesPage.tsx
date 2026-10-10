import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Pencil, Plus, RotateCcw, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import {
  ORIGEM_ROTULOS,
  SITUACOES_CLIENTE,
  formatarCpfCnpj,
  formatarTelefone,
  type Cliente,
  type SituacaoCliente,
} from '@onprint/shared'
import { clientesApi } from '@/api/cadastros'
import { PageHeader } from '@/components/layout/PageHeader'
import { AcaoIcone } from '@/components/shared/AcaoIcone'
import { Can } from '@/components/shared/Can'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { buscarTodasPaginas } from '@/lib/paginacao'
import { DataTable } from '@/components/shared/data-table/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { useStatusConfig } from '@/hooks/useStatusConfig'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form-controls'
import { useListagem } from '@/hooks/useListagem'
import { usePermission } from '@/hooks/usePermission'
import { PreCadastroDialog } from '../components/PreCadastroDialog'
import { useClientes, useMutacaoClientes, useTotalPreCadastros } from '../hooks'
import { abrirLinha } from '@/lib/abrirLinha'
import { PainelCliente } from '../components/PainelCliente'

type FiltroAtivo = 'true' | 'false' | 'todos'

export function ClientesPage() {
  const navigate = useNavigate()
  // Painel lateral da linha clicada (resumo + ações sem sair da lista)
  const [aberto, setAberto] = useState<Cliente | null>(null)
  const lista = useListagem<{ situacao?: string; ativo?: string }>({ situacao: undefined, ativo: 'true' })
  const consulta = useClientes({ ...lista.params, situacao: lista.filtros.situacao as SituacaoCliente | undefined, ativo: lista.filtros.ativo as FiltroAtivo })
  const totalPre = useTotalPreCadastros()
  const { mapa } = useStatusConfig()
  const podeExcluir = usePermission('clientes', 'excluir')
  const podeEditar = usePermission('clientes', 'editar')
  const [confirmar, setConfirmar] = useState<Cliente | null>(null)
  const [preCadastro, setPreCadastro] = useState(false)
  const alterarAtivo = useMutacaoClientes((c: Cliente) => (c.ativo ? clientesApi.desativar(c.id) : clientesApi.reativar(c.id)))

  const colunas = useMemo<ColumnDef<Cliente, unknown>[]>(
    () => [
      {
        id: 'nome',
        header: 'Cliente',
        meta: { ordenavel: 'nome' },
        cell: ({ row: { original: c } }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-texto">{c.nome}</p>
            {c.fantasia && <p className="truncate text-xs text-texto-secundario">{c.fantasia}</p>}
          </div>
        ),
      },
      { id: 'documento', header: 'CPF/CNPJ', cell: ({ row }) => formatarCpfCnpj(row.original.cpfCnpj) || '—' },
      {
        id: 'contato',
        header: 'WhatsApp / Telefone',
        cell: ({ row: { original: c } }) => formatarTelefone(c.whatsapp ?? c.telefone) || c.email || '—',
      },
      { id: 'origem', header: 'Origem', meta: { apartirDe: 'xl' }, cell: ({ row }) => (row.original.origem ? ORIGEM_ROTULOS[row.original.origem] : '—') },
      {
        id: 'situacao',
        header: 'Situação',
        meta: { ordenavel: 'situacao' },
        cell: ({ row: { original: c } }) => (
          <div className="flex flex-wrap justify-end gap-1 md:justify-start">
            <StatusBadge entidade="cliente" codigo={c.situacao} />
            {!c.ativo && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">Desativado</span>}
          </div>
        ),
      },
      { id: 'vendedor', header: 'Vendedor', meta: { apartirDe: '2xl' }, cell: ({ row }) => row.original.vendedor?.nome ?? '—' },
      {
        id: 'acoes',
        header: '',
        meta: { className: 'w-24 text-right', ocultarNoCard: false },
        cell: ({ row: { original: c } }) => (
          <div className="flex justify-end gap-1">
            {podeEditar && <AcaoIcone icone={Pencil} rotulo="Abrir ficha" onClick={() => navigate(`/clientes/${c.id}`)} />}
            {podeExcluir && (
              <AcaoIcone icone={c.ativo ? Trash2 : RotateCcw} rotulo={c.ativo ? 'Desativar' : 'Reativar'} perigo={c.ativo} onClick={() => setConfirmar(c)} />
            )}
          </div>
        ),
      },
    ],
    [navigate, podeEditar, podeExcluir],
  )

  return (
    <>
      <PageHeader
        titulo="Clientes"
        subtitulo="Cadastro de clientes, com destaque para os pré-cadastros vindos do atendimento."
        acoes={
          <Can modulo="clientes" acao="criar">
            <Button variant="outline" onClick={() => setPreCadastro(true)}>
              <UserPlus /> Pré-cadastro rápido
            </Button>
            <Button onClick={() => navigate('/clientes/novo')}>
              <Plus /> Novo cliente
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
        idLinha={(c) => c.id}
        onLinhaClick={(c, e) => abrirLinha(e, `/clientes/${c.id}`, () => setAberto(c))}
        destacarLinha={(c) => c.situacao === 'pre_cadastro'}
        busca={{ valor: lista.busca, onChange: lista.setBusca, placeholder: 'Nome, CPF/CNPJ, WhatsApp, e-mail…' }}
        filtros={
          <>
            <Button
              variant={lista.filtros.situacao === 'pre_cadastro' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => lista.setFiltro('situacao', lista.filtros.situacao === 'pre_cadastro' ? undefined : 'pre_cadastro')}
            >
              Pré-cadastros
              <span className="rounded-full bg-ambar px-1.5 text-xs text-white">{totalPre.data ?? 0}</span>
            </Button>
            <div className="w-48">
              <Select value={lista.filtros.situacao ?? ''} onChange={(e) => lista.setFiltro('situacao', e.target.value || undefined)} aria-label="Situação">
                <option value="">Todas as situações</option>
                {SITUACOES_CLIENTE.map((s) => (
                  <option key={s} value={s}>
                    {mapa.get(`cliente:${s}`)?.rotulo ?? s}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-36">
              <Select value={lista.filtros.ativo} onChange={(e) => lista.setFiltro('ativo', e.target.value)} aria-label="Cadastro">
                <option value="true">Ativos</option>
                <option value="false">Desativados</option>
                <option value="todos">Todos</option>
              </Select>
            </div>
          </>
        }
        exportar={{
          nomeArquivo: 'clientes',
          buscarTodos: () =>
            buscarTodasPaginas((page, pageSize) =>
              clientesApi.listar({ ...lista.params, page, pageSize, situacao: lista.filtros.situacao as SituacaoCliente | undefined, ativo: lista.filtros.ativo as FiltroAtivo }),
            ),
          colunas: [
            { titulo: 'Nome', valor: (c) => c.nome },
            { titulo: 'Fantasia', valor: (c) => c.fantasia },
            { titulo: 'CPF/CNPJ', valor: (c) => formatarCpfCnpj(c.cpfCnpj) },
            { titulo: 'WhatsApp', valor: (c) => formatarTelefone(c.whatsapp) },
            { titulo: 'Telefone', valor: (c) => formatarTelefone(c.telefone) },
            { titulo: 'E-mail', valor: (c) => c.email },
            { titulo: 'Situação', valor: (c) => mapa.get(`cliente:${c.situacao}`)?.rotulo ?? c.situacao },
            { titulo: 'Vendedor', valor: (c) => c.vendedor?.nome },
          ],
        }}
        vazio={{ titulo: 'Nenhum cliente encontrado', descricao: 'Ajuste a busca ou cadastre um novo cliente.' }}
      />

      <PreCadastroDialog aberto={preCadastro} onAbertoChange={setPreCadastro} />
      <ConfirmDialog
        aberto={Boolean(confirmar)}
        onAbertoChange={(v) => !v && setConfirmar(null)}
        titulo={confirmar?.ativo ? 'Desativar cliente' : 'Reativar cliente'}
        descricao={
          confirmar?.ativo ? (
            <>O cliente <strong>{confirmar.nome}</strong> deixa de aparecer nas listas, mas o histórico é mantido.</>
          ) : (
            <>O cliente <strong>{confirmar?.nome}</strong> volta a aparecer nas listas.</>
          )
        }
        textoConfirmar={confirmar?.ativo ? 'Desativar' : 'Reativar'}
        perigoso={confirmar?.ativo}
        onConfirmar={async () => {
          await alterarAtivo.mutateAsync(confirmar!)
          toast.success(confirmar!.ativo ? 'Cliente desativado.' : 'Cliente reativado.')
        }}
      />
      {aberto && <PainelCliente cliente={aberto} onFechar={() => setAberto(null)} />}
    </>
  )
}
