import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, PackageSearch, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Container, GradeEsqueleto, GradeProdutos } from '../componentes/comum'
import { useTituloPagina, useVitrine } from '../contexto'
import { botao } from '../estilos'
import { NaoEncontradoPagina } from './NaoEncontradoPagina'

const POR_PAGINA = 24

/** Páginas visíveis: 1 … 4 5 6 … 12 */
function paginasVisiveis(atual: number, total: number): (number | null)[] {
  const set = new Set([1, total, atual - 1, atual, atual + 1].filter((p) => p >= 1 && p <= total))
  const lista = [...set].sort((a, b) => a - b)
  const saida: (number | null)[] = []
  lista.forEach((p, i) => {
    if (i && p - (lista[i - 1] as number) > 1) saida.push(null)
    saida.push(p)
  })
  return saida
}

function Paginacao({ atual, total, ir }: { atual: number; total: number; ir: (p: number) => void }) {
  if (total <= 1) return null
  const base = 'flex h-11 min-w-11 items-center justify-center rounded-full px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca'
  return (
    <nav aria-label="Páginas" className="mt-14 flex items-center justify-center gap-1.5">
      <button type="button" onClick={() => ir(atual - 1)} disabled={atual <= 1} className={cn(base, 'text-slate-700 hover:bg-slate-100 disabled:opacity-40')} aria-label="Página anterior">
        <ChevronLeft className="h-5 w-5" />
      </button>
      {paginasVisiveis(atual, total).map((p, i) =>
        p === null ? (
          <span key={`r${i}`} className="px-1 text-slate-400">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => ir(p)}
            aria-current={p === atual ? 'page' : undefined}
            className={cn(base, p === atual ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100')}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" onClick={() => ir(atual + 1)} disabled={atual >= total} className={cn(base, 'text-slate-700 hover:bg-slate-100 disabled:opacity-40')} aria-label="Próxima página">
        <ChevronRight className="h-5 w-5" />
      </button>
    </nav>
  )
}

export function ProdutosPagina() {
  const { api, slug, vitrine } = useVitrine()
  const { id: categoriaId } = useParams()
  const [params, setParams] = useSearchParams()
  const busca = params.get('busca')?.trim() ?? ''
  const pagina = Math.max(1, Number(params.get('pagina')) || 1)
  const categoria = categoriaId ? vitrine.categorias.find((c) => c.id === categoriaId) : null
  useTituloPagina(categoria?.nome ?? (busca ? `Busca: ${busca}` : 'Produtos'))

  const [texto, setTexto] = useState(busca)
  useEffect(() => setTexto(busca), [busca])
  // Busca enquanto digita (com uma pausa), voltando para a primeira página
  useEffect(() => {
    const t = texto.trim()
    if (t === busca) return
    const espera = window.setTimeout(() => {
      setParams(
        (p) => {
          const n = new URLSearchParams(p)
          if (t) n.set('busca', t)
          else n.delete('busca')
          n.delete('pagina')
          return n
        },
        { replace: true },
      )
    }, 350)
    return () => window.clearTimeout(espera)
  }, [texto, busca, setParams])

  const filtro = { busca: busca || undefined, categoriaId: categoriaId ?? undefined, page: pagina, pageSize: POR_PAGINA }
  const consulta = useQuery({
    queryKey: ['vitrine', slug, 'produtos', filtro],
    queryFn: () => api.produtos(filtro),
    placeholderData: keepPreviousData,
    enabled: !categoriaId || Boolean(categoria),
  })

  if (categoriaId && !categoria) return <NaoEncontradoPagina titulo="Categoria não encontrada" texto="Esta categoria não existe mais ou está sem produtos no momento." />

  const total = consulta.data?.meta.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const ir = (p: number) => {
    setParams((atual) => {
      const n = new URLSearchParams(atual)
      if (p > 1) n.set('pagina', String(p))
      else n.delete('pagina')
      return n
    })
    window.scrollTo({ top: 0 })
  }
  const sufixoBusca = busca ? `?busca=${encodeURIComponent(busca)}` : ''
  const categorias = vitrine.categorias.filter((c) => c.quantidade > 0)
  const chip = (ativo: boolean) =>
    cn(
      'shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca',
      ativo ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400',
    )

  return (
    <Container className="pt-8 lg:pt-12">
      <nav aria-label="Você está em" className="mb-4 text-sm text-slate-500">
        <Link to="/" className="hover:text-slate-900 hover:underline">
          Início
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        {categoria ? (
          <>
            <Link to="/produtos" className="hover:text-slate-900 hover:underline">
              Produtos
            </Link>
            <span className="mx-2" aria-hidden="true">
              /
            </span>
            <span className="text-slate-900">{categoria.nome}</span>
          </>
        ) : (
          <span className="text-slate-900">Produtos</span>
        )}
      </nav>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="vt-titulo text-3xl font-extrabold text-slate-900 sm:text-4xl">{categoria?.nome ?? 'Todos os produtos'}</h1>
          <p className="mt-2 text-slate-500" aria-live="polite">
            {consulta.data ? `${total} ${total === 1 ? 'produto' : 'produtos'}${busca ? ` para “${busca}”` : ''}` : 'Carregando…'}
          </p>
        </div>
        <div className="relative w-full lg:max-w-sm">
          <label htmlFor="busca-produtos" className="sr-only">
            Buscar nesta página
          </label>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[1.125rem] w-[1.125rem] -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            id="busca-produtos"
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={categoria ? `Buscar em ${categoria.nome}` : 'Buscar produtos'}
            maxLength={80}
            className="h-12 w-full rounded-full border border-slate-200 bg-white pl-11 pr-4 text-[0.9375rem] text-slate-900 transition placeholder:text-slate-500 focus:border-marca focus:outline-none focus:ring-4 focus:ring-marca/15"
          />
        </div>
      </div>

      {categorias.length > 0 && (
        <div className="vt-sem-barra -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="list" aria-label="Filtrar por categoria">
          <Link role="listitem" to={`/produtos${sufixoBusca}`} className={chip(!categoriaId)} aria-current={!categoriaId ? 'page' : undefined}>
            Todas
          </Link>
          {categorias.map((c) => (
            <Link
              role="listitem"
              key={c.id}
              to={`/categoria/${c.id}${sufixoBusca}`}
              className={chip(c.id === categoriaId)}
              aria-current={c.id === categoriaId ? 'page' : undefined}
            >
              {c.nome} <span className={cn('ml-1 text-xs', c.id === categoriaId ? 'text-white/70' : 'text-slate-400')}>{c.quantidade}</span>
            </Link>
          ))}
        </div>
      )}

      <div className={cn('mt-10 transition-opacity', consulta.isPlaceholderData && 'opacity-60')}>
        {consulta.isError ? (
          <div className="rounded-3xl border border-slate-200 px-6 py-16 text-center">
            <p className="font-semibold text-slate-900">Não foi possível carregar os produtos.</p>
            <p className="mt-1 text-slate-500">{consulta.error.message}</p>
            <button type="button" onClick={() => void consulta.refetch()} className={cn(botao.base, botao.escuro, botao.md, 'mt-6')}>
              Tentar de novo
            </button>
          </div>
        ) : !consulta.data ? (
          <GradeEsqueleto quantidade={12} />
        ) : consulta.data.data.length ? (
          <GradeProdutos produtos={consulta.data.data} prioridade={4} />
        ) : (
          <div className="flex flex-col items-center rounded-3xl bg-slate-50 px-6 py-20 text-center">
            <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
              <PackageSearch className="h-7 w-7" aria-hidden="true" />
            </span>
            <p className="vt-titulo text-xl font-extrabold text-slate-900">Nenhum produto encontrado</p>
            <p className="mt-2 max-w-md text-slate-600">
              {busca ? 'Tente outra palavra ou veja todas as categorias. Não achou? Fale com a gente pelo WhatsApp.' : 'Ainda não há produtos nesta categoria.'}
            </p>
            {busca && (
              <button type="button" onClick={() => setTexto('')} className={cn(botao.base, botao.contorno, botao.md, 'mt-6')}>
                <X /> Limpar busca
              </button>
            )}
          </div>
        )}
      </div>
      <Paginacao atual={Math.min(pagina, paginas)} total={paginas} ir={ir} />
    </Container>
  )
}
