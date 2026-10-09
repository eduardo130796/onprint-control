import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  MODOS_CALCULO,
  MODO_CALCULO_ROTULOS,
  TIPOS_PRODUTO,
  TIPO_PRODUTO_ROTULOS,
  type ModoCalculo,
  type Produto,
  type TipoProduto,
} from '@onprint/shared'
import { produtosApi } from '@/api/produtos'
import { PageHeader } from '@/components/layout/PageHeader'
import { AcaoIcone } from '@/components/shared/AcaoIcone'
import { BadgeInativo } from '@/components/shared/CadastroLista'
import { Can } from '@/components/shared/Can'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { DataTable } from '@/components/shared/data-table/DataTable'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form-controls'
import { useListagem } from '@/hooks/useListagem'
import { usePermissoes } from '@/hooks/usePermission'
import { buscarTodasPaginas } from '@/lib/paginacao'
import { formatarPrecoUnitario } from '@/lib/produtos'
import { cn } from '@/lib/utils'
import { useCategorias, useMutacao, useProdutos } from '../hooks'

const COR_TIPO: Record<TipoProduto, string> = {
  produto: 'bg-accent text-tinta',
  servico: 'bg-sky-100 text-sky-800',
  insumo: 'bg-slate-100 text-slate-600',
  revenda: 'bg-violet-100 text-violet-700',
}

export function ProdutosPage() {
  const navigate = useNavigate()
  const pode = usePermissoes()
  const categorias = useCategorias('true')
  // ativo vazio = só ativos (padrão da API)
  const lista = useListagem<{ ativo?: string; tipo?: string; modoCalculo?: string; categoriaId?: string }>({})
  const params = {
    ...lista.params,
    ativo: lista.filtros.ativo as 'false' | 'todos' | undefined,
    tipo: lista.filtros.tipo as TipoProduto | undefined,
    modoCalculo: lista.filtros.modoCalculo as ModoCalculo | undefined,
  }
  const consulta = useProdutos(params)
  const [confirmar, setConfirmar] = useState<Produto | null>(null)
  const alterarAtivo = useMutacao(['produtos'], (p: Produto) => (p.ativo ? produtosApi.desativar(p.id) : produtosApi.reativar(p.id)))

  const colunas = useMemo<ColumnDef<Produto, unknown>[]>(
    () => [
      { id: 'codigo', header: 'Código', meta: { ordenavel: 'codigo', className: 'w-28' }, cell: ({ row }) => <span className="font-mono text-xs">{row.original.codigo}</span> },
      {
        id: 'nome',
        header: 'Produto / serviço',
        meta: { ordenavel: 'nome' },
        cell: ({ row: { original: p } }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">
              {p.nome}
              <BadgeInativo ativo={p.ativo} />
            </p>
            {p.categoria && <p className="truncate text-xs text-texto-secundario">{p.categoria.nome}</p>}
          </div>
        ),
      },
      {
        id: 'tipo',
        header: 'Tipo',
        cell: ({ row }) => <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', COR_TIPO[row.original.tipo])}>{TIPO_PRODUTO_ROTULOS[row.original.tipo]}</span>,
      },
      { id: 'modo', header: 'Cálculo', cell: ({ row }) => MODO_CALCULO_ROTULOS[row.original.modoCalculo] },
      {
        id: 'preco',
        header: 'Preço',
        meta: { ordenavel: 'precoVenda' },
        cell: ({ row: { original: p } }) => (p.tipo === 'insumo' ? <span className="text-texto-secundario">—</span> : formatarPrecoUnitario(p.precoVenda, p.modoCalculo)),
      },
      {
        id: 'acoes',
        header: '',
        meta: { className: 'w-24 text-right' },
        cell: ({ row: { original: p } }) => (
          <div className="flex justify-end gap-1">
            <AcaoIcone icone={Pencil} rotulo="Abrir" onClick={() => navigate(`/produtos/${p.id}`)} />
            {pode('produtos', 'excluir') && (
              <AcaoIcone icone={p.ativo ? Trash2 : RotateCcw} rotulo={p.ativo ? 'Desativar' : 'Reativar'} perigo={p.ativo} onClick={() => setConfirmar(p)} />
            )}
          </div>
        ),
      },
    ],
    [navigate, pode],
  )

  const filtro = (nome: keyof typeof lista.filtros, rotulo: string, opcoes: { valor: string; texto: string }[], largura = 'w-44') => (
    <div className={largura}>
      <Select value={lista.filtros[nome] ?? ''} onChange={(e) => lista.setFiltro(nome, e.target.value || undefined)} aria-label={rotulo}>
        <option value="">{rotulo}</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </Select>
    </div>
  )

  return (
    <>
      <PageHeader
        titulo="Produtos e serviços"
        subtitulo="Catálogo com preço, forma de cálculo, acabamentos, ficha técnica e roteiro de produção."
        acoes={
          <Can modulo="produtos" acao="criar">
            <Button onClick={() => navigate('/produtos/novo')}>
              <Plus /> Novo produto
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
        idLinha={(p) => p.id}
        onLinhaClick={(p) => navigate(`/produtos/${p.id}`)}
        busca={{ valor: lista.busca, onChange: lista.setBusca, placeholder: 'Nome ou código…' }}
        filtros={
          <>
            {filtro('tipo', 'Todos os tipos', TIPOS_PRODUTO.map((t) => ({ valor: t, texto: TIPO_PRODUTO_ROTULOS[t] })), 'w-40')}
            {filtro('modoCalculo', 'Qualquer cálculo', MODOS_CALCULO.map((m) => ({ valor: m, texto: MODO_CALCULO_ROTULOS[m] })))}
            {filtro('categoriaId', 'Todas as categorias', (categorias.data ?? []).map((c) => ({ valor: c.id, texto: c.caminho })), 'w-56')}
            {filtro('ativo', 'Ativos', [{ valor: 'false', texto: 'Desativados' }, { valor: 'todos', texto: 'Todos' }], 'w-36')}
          </>
        }
        exportar={{
          nomeArquivo: 'produtos',
          buscarTodos: () => buscarTodasPaginas((page, pageSize) => produtosApi.listar({ ...params, page, pageSize })),
          colunas: [
            { titulo: 'Código', valor: (p) => p.codigo },
            { titulo: 'Nome', valor: (p) => p.nome },
            { titulo: 'Categoria', valor: (p) => p.categoria?.nome },
            { titulo: 'Tipo', valor: (p) => TIPO_PRODUTO_ROTULOS[p.tipo] },
            { titulo: 'Cálculo', valor: (p) => MODO_CALCULO_ROTULOS[p.modoCalculo] },
            { titulo: 'Preço de venda', valor: (p) => p.precoVenda.replace('.', ',') },
          ],
        }}
        vazio={{ titulo: 'Nenhum produto encontrado' }}
      />
      <ConfirmDialog
        aberto={Boolean(confirmar)}
        onAbertoChange={(v) => !v && setConfirmar(null)}
        titulo={confirmar?.ativo ? 'Desativar produto' : 'Reativar produto'}
        descricao={<>Confirma a alteração de <strong>{confirmar?.nome}</strong>? Produtos desativados não aparecem nos orçamentos.</>}
        textoConfirmar={confirmar?.ativo ? 'Desativar' : 'Reativar'}
        perigoso={confirmar?.ativo}
        onConfirmar={async () => {
          await alterarAtivo.mutateAsync(confirmar!)
          toast.success('Produto atualizado.')
        }}
      />
    </>
  )
}
