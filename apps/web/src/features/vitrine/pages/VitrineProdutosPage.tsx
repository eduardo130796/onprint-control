import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { ChevronDown, Download, ExternalLink, Eye, FileText, ImageOff, Loader2, Package, Settings2, Share2, Star } from 'lucide-react'
import { toast } from 'sonner'
import type { Paginado, ProdutoVitrineInput, ProdutoVitrineResumo, ProdutosVitrineQuery } from '@onprint/shared'
import { CHAVE_VITRINE_CONFIG, CHAVE_VITRINE_PRODUTOS, vitrineApi } from '@/api/vitrine'
import { PageHeader } from '@/components/layout/PageHeader'
import { AcaoIcone } from '@/components/shared/AcaoIcone'
import { CartaoIndicador } from '@/components/shared/CartaoIndicador'
import { DataTable } from '@/components/shared/data-table/DataTable'
import { AcaoPainel, PainelCartao } from '@/components/shared/kanban/PainelCartao'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select } from '@/components/ui/form-controls'
import { useDebounce } from '@/hooks/useDebounce'
import { usePermissoes } from '@/hooks/usePermission'
import { useCategorias } from '@/features/produtos/hooks'
import { podeCompartilharArquivo } from '../compartilhar'
import { CompartilharDialog, type AlvoCompartilhar } from '../components/CompartilharDialog'
import { BotaoSalvarVitrine, EditorProdutoVitrine } from '../components/EditorProdutoVitrine'
import { Interruptor } from '../components/Interruptor'
import { useProdutosVitrine, useVitrineConfig } from '../hooks'
import { useCatalogoPdf } from '../useCatalogoPdf'
import { useEditorVitrine } from '../useEditorVitrine'
import { urlProduto } from '../divulgar'
import { dadosVitrine, precoExibido } from '../utils'

/** Miniatura da capa (ou um ícone, sem foto) */
function Capa({ produto, tamanho = 'h-11 w-11' }: { produto: ProdutoVitrineResumo; tamanho?: string }) {
  const capa = produto.imagens[0]?.url
  return capa ? (
    <img src={capa} alt="" loading="lazy" className={`${tamanho} shrink-0 rounded-xl object-cover ring-1 ring-border`} />
  ) : (
    <span className={`${tamanho} flex shrink-0 items-center justify-center rounded-xl bg-fundo text-texto-secundario ring-1 ring-border`} title="Sem foto">
      <ImageOff className="h-4 w-4" />
    </span>
  )
}

/** "Catálogo em PDF": baixa; no celular (Web Share com arquivo), também compartilha */
function BotaoCatalogo({ publicados }: { publicados: number }) {
  const catalogo = useCatalogoPdf()
  const [compartilha] = useState(podeCompartilharArquivo)
  const icone = catalogo.gerando ? <Loader2 className="animate-spin" /> : <FileText />
  const titulo = publicados === 0 ? 'Publique ao menos um produto para gerar o catálogo' : undefined
  if (!compartilha) {
    return (
      <Button type="button" variant="outline" disabled={publicados === 0 || Boolean(catalogo.gerando)} title={titulo} onClick={() => void catalogo.gerar('baixar')}>
        {icone} Catálogo em PDF
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" disabled={publicados === 0 || Boolean(catalogo.gerando)} title={titulo}>
          {icone} Catálogo em PDF <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void catalogo.gerar('compartilhar')}>
          <Share2 /> Compartilhar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void catalogo.gerar('baixar')}>
          <Download /> Baixar PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Vitrine → Produtos na vitrine: escolher o que aparece no site, destacar e editar textos, preço e fotos. */
export function VitrineProdutosPage() {
  const queryClient = useQueryClient()
  const pode = usePermissoes()
  const podeEditar = pode('vitrine', 'editar')
  const podeEditarFotos = podeEditar || pode('produtos', 'editar')
  const [busca, setBusca] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [publicado, setPublicado] = useState<'' | 'true' | 'false'>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [compartilhando, setCompartilhando] = useState<AlvoCompartilhar | null>(null)
  const config = useVitrineConfig()
  const buscaAtrasada = useDebounce(busca.trim())
  const q: ProdutosVitrineQuery = { busca: buscaAtrasada || undefined, categoriaId: categoriaId || undefined, publicado: publicado || undefined }
  const consulta = useProdutosVitrine(q)
  // Resumo (cartões) sempre sobre todos os produtos, sem filtros
  const todos = useProdutosVitrine()
  const categorias = useCategorias('true')
  const aberto = consulta.data?.find((p) => p.id === abertoId) ?? todos.data?.find((p) => p.id === abertoId)

  // Interruptores da linha: muda na hora (otimista) e confirma com a API
  const alternar = useMutation({
    mutationFn: ({ p, mudancas }: { p: ProdutoVitrineResumo; mudancas: Partial<ProdutoVitrineInput> }) => vitrineApi.salvarProduto(p.id, dadosVitrine(p, mudancas)),
    onMutate: async ({ p, mudancas }) => {
      await queryClient.cancelQueries({ queryKey: [CHAVE_VITRINE_PRODUTOS] })
      const anteriores = queryClient.getQueriesData<ProdutoVitrineResumo[]>({ queryKey: [CHAVE_VITRINE_PRODUTOS] })
      queryClient.setQueriesData<ProdutoVitrineResumo[]>({ queryKey: [CHAVE_VITRINE_PRODUTOS] }, (lista) =>
        lista?.map((x) => (x.id === p.id ? { ...x, ...(mudancas as Partial<ProdutoVitrineResumo>) } : x)),
      )
      return { anteriores }
    },
    onError: (e, _v, ctx) => {
      ctx?.anteriores.forEach(([chave, dados]) => queryClient.setQueryData(chave, dados))
      toast.error(e.message)
    },
    onSettled: () =>
      Promise.all([queryClient.invalidateQueries({ queryKey: [CHAVE_VITRINE_PRODUTOS] }), queryClient.invalidateQueries({ queryKey: CHAVE_VITRINE_CONFIG })]),
  })

  // A API devolve a lista inteira (sem paginação): pagina aqui para a tabela
  const resultado = useMemo<Paginado<ProdutoVitrineResumo> | undefined>(() => {
    if (!consulta.data) return undefined
    return { data: consulta.data.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, total: consulta.data.length } }
  }, [consulta.data, page, pageSize])

  const resumo = useMemo(() => {
    const lista = todos.data ?? []
    const publicados = lista.filter((p) => p.publicado)
    return {
      publicados: publicados.length,
      destaques: publicados.filter((p) => p.destaque).length,
      semFoto: publicados.filter((p) => p.imagens.length === 0).length,
      total: lista.length,
    }
  }, [todos.data])

  const colunas = useMemo<ColumnDef<ProdutoVitrineResumo, unknown>[]>(
    () => [
      {
        id: 'produto',
        header: 'Produto',
        meta: { ocultarNoCard: true },
        cell: ({ row: { original: p } }) => (
          <div className="flex min-w-0 items-center gap-3">
            <Capa produto={p} />
            <div className="min-w-0">
              <p className="truncate font-medium text-tinta">{p.nomePublico || p.nome}</p>
              <p className="truncate text-xs text-texto-secundario">
                <span className="font-mono">{p.codigo}</span>
                {p.nomePublico && p.nomePublico !== p.nome && <> · {p.nome}</>}
                {!p.ativo && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[0.6875rem] text-slate-700">Desativado</span>}
              </p>
            </div>
          </div>
        ),
      },
      { id: 'categoria', header: 'Categoria', meta: { apartirDe: 'xl', ocultarNoCard: true }, cell: ({ row }) => row.original.categoria?.nome ?? <span className="text-texto-secundario">—</span> },
      {
        id: 'preco',
        header: 'Preço no site',
        cell: ({ row }) => <span className={row.original.modoPreco === 'sob_consulta' ? 'text-texto-secundario' : 'tabular-nums'}>{precoExibido(row.original)}</span>,
      },
      {
        id: 'publicado',
        header: 'Publicado',
        meta: { className: 'w-28' },
        cell: ({ row: { original: p } }) => (
          <Interruptor
            rotulo={`Publicar ${p.nomePublico || p.nome}`}
            marcado={p.publicado}
            desabilitado={!podeEditar || (!p.ativo && !p.publicado)}
            dica={!p.ativo && !p.publicado ? 'Produto desativado no cadastro' : undefined}
            onMudar={(v) => alternar.mutate({ p, mudancas: { publicado: v } })}
          />
        ),
      },
      {
        id: 'destaque',
        header: 'Destaque',
        meta: { className: 'w-28' },
        cell: ({ row: { original: p } }) => (
          <Interruptor
            rotulo={`Destacar ${p.nomePublico || p.nome}`}
            marcado={p.destaque}
            desabilitado={!podeEditar}
            dica={!p.publicado ? 'Só aparece em destaque depois de publicado' : undefined}
            className={!p.publicado && !p.destaque ? 'opacity-60' : undefined}
            onMudar={(v) => alternar.mutate({ p, mudancas: { destaque: v } })}
          />
        ),
      },
      {
        id: 'acoes',
        header: '',
        meta: { className: 'w-14 text-right' },
        cell: ({ row: { original: p } }) =>
          p.publicado ? (
            <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
              <AcaoIcone icone={Share2} rotulo={`Compartilhar ${p.nomePublico || p.nome}`} onClick={() => setCompartilhando({ tipo: 'produto', produto: p })} />
            </div>
          ) : null,
      },
    ],
    [podeEditar, alternar],
  )

  // No celular, o cartão da linha começa com a foto e o nome
  const colunasComCartao = useMemo<ColumnDef<ProdutoVitrineResumo, unknown>[]>(
    () => [
      {
        id: 'cartao',
        header: '',
        meta: { className: 'hidden' },
        cell: ({ row: { original: p } }) => (
          <div className="-mb-1 flex items-center gap-3 text-left lg:hidden">
            <Capa produto={p} tamanho="h-14 w-14" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-tinta">{p.nomePublico || p.nome}</p>
              <p className="truncate text-xs text-texto-secundario">
                <span className="font-mono">{p.codigo}</span>
                {p.categoria && <> · {p.categoria.nome}</>}
              </p>
            </div>
          </div>
        ),
      },
      ...colunas,
    ],
    [colunas],
  )

  const filtrando = Boolean(buscaAtrasada || categoriaId || publicado)

  return (
    <>
      <PageHeader
        titulo="Produtos na vitrine"
        subtitulo="Escolha o que aparece no seu site, o que fica em destaque, as fotos e como o preço é mostrado."
        acoes={
          <>
            <BotaoCatalogo publicados={resumo.publicados} />
            <Button asChild variant="outline">
              <Link to="/vitrine">
                <Settings2 /> Configurar vitrine
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CartaoIndicador rotulo="Publicados" valor={todos.data ? resumo.publicados : '—'} icone={Eye} tom="marca" detalhe={todos.data ? `de ${resumo.total} produtos ativos` : undefined} />
        <CartaoIndicador rotulo="Em destaque" valor={todos.data ? resumo.destaques : '—'} icone={Star} detalhe="no início do site (até 12)" />
        <CartaoIndicador
          rotulo="Publicados sem foto"
          valor={todos.data ? resumo.semFoto : '—'}
          icone={ImageOff}
          tom={resumo.semFoto > 0 ? 'alerta' : 'positivo'}
          detalhe={resumo.semFoto > 0 ? 'Produto com foto vende mais' : 'Tudo com foto'}
        />
        <CartaoIndicador rotulo="Rascunhos" valor={todos.data ? resumo.total - resumo.publicados : '—'} icone={Package} detalhe="ativos, fora do site" />
      </div>

      <DataTable
        colunas={colunasComCartao}
        resultado={resultado}
        carregando={consulta.isFetching}
        erro={consulta.error}
        onTentarNovamente={() => void consulta.refetch()}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n)
          setPage(1)
        }}
        idLinha={(p) => p.id}
        onLinhaClick={(p) => setAbertoId(p.id)}
        busca={{
          valor: busca,
          onChange: (v) => {
            setBusca(v)
            setPage(1)
          },
          placeholder: 'Nome, nome no site ou código…',
        }}
        filtros={
          <>
            <div className="w-full sm:w-48">
              <Select
                value={categoriaId}
                onChange={(e) => {
                  setCategoriaId(e.target.value)
                  setPage(1)
                }}
                aria-label="Categoria"
              >
                <option value="">Todas as categorias</option>
                {categorias.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full sm:w-44">
              <Select
                value={publicado}
                onChange={(e) => {
                  setPublicado(e.target.value as typeof publicado)
                  setPage(1)
                }}
                aria-label="Situação no site"
              >
                <option value="">Publicados e rascunhos</option>
                <option value="true">Só publicados</option>
                <option value="false">Só rascunhos</option>
              </Select>
            </div>
          </>
        }
        vazio={
          filtrando
            ? { titulo: 'Nenhum produto encontrado', descricao: 'Mude a busca ou os filtros.' }
            : {
                titulo: 'Nenhum produto ativo',
                descricao: 'Cadastre produtos e serviços no Catálogo; eles aparecem aqui para você publicar no site.',
                acao: (
                  <Button asChild>
                    <Link to="/produtos/novo">Cadastrar produto</Link>
                  </Button>
                ),
              }
        }
      />

      {aberto && (
        <PainelProduto
          key={aberto.id}
          produto={aberto}
          podeEditar={podeEditar}
          podeEditarFotos={podeEditarFotos}
          urlPublica={config.data?.urlPublica}
          onCompartilhar={() => setCompartilhando({ tipo: 'produto', produto: aberto })}
          onFechar={() => setAbertoId(null)}
        />
      )}
      <CompartilharDialog alvo={compartilhando} onFechar={() => setCompartilhando(null)} />
    </>
  )
}

interface PainelProdutoProps {
  produto: ProdutoVitrineResumo
  podeEditar: boolean
  podeEditarFotos: boolean
  urlPublica: string | undefined
  onCompartilhar: () => void
  onFechar: () => void
}

function PainelProduto({ produto, podeEditar, podeEditarFotos, urlPublica, onCompartilhar, onFechar }: PainelProdutoProps) {
  const editor = useEditorVitrine(produto)
  // Compartilhar e abrir no site só depois de publicado (antes, o link dá "página não encontrada")
  const noSite = produto.publicado && produto.slug && urlPublica
  return (
    <PainelCartao
      aberto
      onFechar={onFechar}
      titulo={produto.nomePublico || produto.nome}
      subtitulo={
        <span className="flex flex-wrap items-center gap-x-2">
          <span className="font-mono">{produto.codigo}</span>
          {produto.categoria && <>· {produto.categoria.nome}</>}
          <Link to={`/produtos/${produto.id}`} className="font-medium text-marca-escuro hover:underline">
            Abrir cadastro
          </Link>
        </span>
      }
      acoes={
        noSite ? (
          <>
            <AcaoPainel icone={Share2} rotulo="Compartilhar" destaque onClick={onCompartilhar} />
            <AcaoPainel icone={ExternalLink} rotulo="Ver no site" onClick={() => window.open(urlProduto(urlPublica, produto.slug), '_blank', 'noopener')} />
          </>
        ) : undefined
      }
      rodape={podeEditar ? <BotaoSalvarVitrine editor={editor} className="w-full" /> : undefined}
    >
      <EditorProdutoVitrine editor={editor} podeEditar={podeEditar} podeEditarFotos={podeEditarFotos} />
    </PainelCartao>
  )
}
