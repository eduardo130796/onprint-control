import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, Layers, Plus } from 'lucide-react'
import { TIPO_EMBALAGEM_ROTULOS, type InsumoResumo } from '@onprint/shared'
import { insumosApi } from '@/api/custos'
import { PageHeader } from '@/components/layout/PageHeader'
import { BadgeInativo } from '@/components/shared/CadastroLista'
import { Can } from '@/components/shared/Can'
import { DataTable } from '@/components/shared/data-table/DataTable'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form-controls'
import { useListagem } from '@/hooks/useListagem'
import { buscarTodasPaginas } from '@/lib/paginacao'
import { formatarQuantidade } from '@/lib/quantidade'
import { formatarCusto } from '../custos'
import { useCategorias, useInsumos } from '../hooks'

/** Produtos → Insumos e materiais: o que a gráfica compra para produzir (lona, tinta, ilhós, chapa…). */
export function InsumosPage() {
  const navigate = useNavigate()
  const categorias = useCategorias('true')
  const lista = useListagem<{ ativo?: string; categoriaId?: string; abaixoMinimo?: string }>({})
  const params = {
    ...lista.params,
    ativo: lista.filtros.ativo as 'false' | 'todos' | undefined,
    abaixoMinimo: lista.filtros.abaixoMinimo as 'true' | undefined,
  }
  const consulta = useInsumos(params)
  // O custo só vem para quem pode ver custos: sem ele, a coluna some
  const temCusto = consulta.data?.data.some((i) => i.custo !== undefined) ?? false

  const colunas = useMemo<ColumnDef<InsumoResumo, unknown>[]>(() => {
    const cols: ColumnDef<InsumoResumo, unknown>[] = [
      {
        id: 'nome',
        header: 'Insumo',
        meta: { ordenavel: 'nome' },
        cell: ({ row: { original: i } }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-tinta">
              {i.nome}
              <BadgeInativo ativo={i.ativo} />
            </p>
            <p className="truncate text-xs text-texto-secundario">
              <span className="font-mono">{i.codigo}</span>
              {i.categoria && <> · {i.categoria.nome}</>}
            </p>
          </div>
        ),
      },
      { id: 'embalagem', header: 'Compra em', cell: ({ row }) => TIPO_EMBALAGEM_ROTULOS[row.original.embalagem] ?? '—' },
    ]
    if (temCusto) {
      cols.push({
        id: 'custo',
        header: 'Custo por unidade de uso',
        cell: ({ row: { original: i } }) =>
          Number(i.custo ?? 0) > 0 ? (
            <span className="font-medium text-tinta">
              {formatarCusto(i.custo)}
              {i.unidadeMedida && <span className="text-texto-secundario"> / {i.unidadeMedida.sigla}</span>}
            </span>
          ) : (
            <span className="text-texto-secundario">Sem custo</span>
          ),
      })
    }
    cols.push(
      {
        id: 'saldo',
        header: 'Estoque',
        cell: ({ row: { original: i } }) =>
          i.saldo === null ? (
            <span className="text-texto-secundario">Não controla</span>
          ) : (
            <span className="inline-flex items-center gap-2">
              {formatarQuantidade(i.saldo, i.unidadeMedida?.sigla)}
              {i.abaixoMinimo && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-amber-800">
                  <AlertTriangle className="h-3 w-3" /> Abaixo do mínimo
                </span>
              )}
            </span>
          ),
      },
      {
        id: 'usadoEm',
        header: 'Usado em',
        cell: ({ row: { original: i } }) =>
          i.usadoEm ? `${i.usadoEm} produto${i.usadoEm > 1 ? 's' : ''}` : <span className="text-texto-secundario">Nenhum produto</span>,
      },
    )
    return cols
  }, [temCusto])

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
        titulo="Insumos e materiais"
        subtitulo="O que você compra para produzir: lona, tinta, ilhós, chapa… O custo de cada um entra na composição dos produtos."
        acoes={
          <Can modulo="produtos" acao="criar">
            <Button onClick={() => navigate('/produtos/insumos/novo')}>
              <Plus /> Novo insumo
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
        idLinha={(i) => i.id}
        onLinhaClick={(i) => navigate(`/produtos/insumos/${i.id}`)}
        destacarLinha={(i) => i.abaixoMinimo}
        busca={{ valor: lista.busca, onChange: lista.setBusca, placeholder: 'Nome ou código…' }}
        filtros={
          <>
            {filtro('categoriaId', 'Todas as categorias', (categorias.data ?? []).map((c) => ({ valor: c.id, texto: c.caminho })), 'w-56')}
            {filtro('abaixoMinimo', 'Qualquer estoque', [{ valor: 'true', texto: 'Abaixo do mínimo' }])}
            {filtro('ativo', 'Ativos', [{ valor: 'false', texto: 'Desativados' }, { valor: 'todos', texto: 'Todos' }], 'w-36')}
          </>
        }
        exportar={{
          nomeArquivo: 'insumos',
          buscarTodos: () => buscarTodasPaginas((page, pageSize) => insumosApi.listar({ ...params, page, pageSize })),
          colunas: [
            { titulo: 'Código', valor: (i) => i.codigo },
            { titulo: 'Nome', valor: (i) => i.nome },
            { titulo: 'Categoria', valor: (i) => i.categoria?.nome },
            { titulo: 'Compra em', valor: (i) => TIPO_EMBALAGEM_ROTULOS[i.embalagem] },
            { titulo: 'Unidade de uso', valor: (i) => i.unidadeMedida?.sigla },
            { titulo: 'Custo por unidade de uso', valor: (i) => (i.custo ?? '').replace('.', ',') },
            { titulo: 'Saldo', valor: (i) => (i.saldo ?? '').replace('.', ',') },
            { titulo: 'Usado em (produtos)', valor: (i) => String(i.usadoEm) },
          ],
        }}
        vazio={{
          titulo: 'Nenhum insumo por aqui',
          descricao: 'Cadastre o que você compra para produzir (lona, tinta, ilhós…) e informe como compra: o sistema calcula o custo de cada m², metro ou unidade.',
          acao: (
            <Can modulo="produtos" acao="criar">
              <Button onClick={() => navigate('/produtos/insumos/novo')}>
                <Layers /> Cadastrar insumo
              </Button>
            </Can>
          ),
        }}
      />
    </>
  )
}
