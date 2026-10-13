import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowUpDown, ChevronLeft, ChevronRight, PackageSearch, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Container, GradeEsqueleto, GradeProdutos } from '../componentes/comum'
import { IconeWhatsapp } from '../componentes/icones'
import { ORDENS_PRODUTOS, lerOrdem, ordenarProdutos } from '../catalogo'
import { useTituloPagina, useVitrine, useWhatsappGeral } from '../contexto'
import { botao } from '../estilos'
import { classesFade, useRolagemLateral } from '../rolagem'
import { descricaoProdutos } from '../seo'
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
    <nav aria-label="Páginas" className="mt-10 flex items-center justify-center gap-1 sm:mt-14 sm:gap-1.5">
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
  const wa = useWhatsappGeral()
  const { id: categoriaId } = useParams()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const busca = params.get('busca')?.trim() ?? ''
  const pagina = Math.max(1, Number(params.get('pagina')) || 1)
  const ordem = lerOrdem(params.get('ordem'))
  const categoria = categoriaId ? vitrine.categorias.find((c) => c.id === categoriaId) : null
  useTituloPagina(categoria?.nome ?? (busca ? `Busca: ${busca}` : 'Produtos'), descricaoProdutos(vitrine.empresa, { categoria, busca }))

  const campo = useRef<HTMLInputElement>(null)
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

  // Aba "Buscar" do celular: chega aqui com o campo já em foco
  const pediuBusca = (location.state as { buscar?: boolean } | null)?.buscar
  useEffect(() => {
    if (!pediuBusca) return
    window.scrollTo({ top: 0 })
    campo.current?.focus({ preventScroll: true })
  }, [pediuBusca, location.key])

  const filtro = { busca: busca || undefined, categoriaId: categoriaId ?? undefined, page: pagina, pageSize: POR_PAGINA }
  const consulta = useQuery({
    queryKey: ['vitrine', slug, 'produtos', filtro],
    queryFn: () => api.produtos(filtro),
    placeholderData: keepPreviousData,
    enabled: !categoriaId || Boolean(categoria),
  })
  const categorias = vitrine.categorias.filter((c) => c.quantidade > 0)
  const faixa = useRolagemLateral<HTMLDivElement>(categorias.length)
  // Traz a categoria escolhida para a vista na faixa (pode estar lá no fim)
  useEffect(() => {
    faixa.ref.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [categoriaId, faixa.ref])

  if (categoriaId && !categoria) return <NaoEncontradoPagina titulo="Categoria não encontrada" texto="Esta categoria não existe mais ou está sem produtos no momento." />

  const total = consulta.data?.meta.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  // Ordenar só quando tudo cabe numa página (a API manda na ordem da gráfica; reordenar uma página só enganaria)
  const podeOrdenar = consulta.data !== undefined && total > 1 && paginas === 1
  const produtos = consulta.data ? ordenarProdutos(consulta.data.data, podeOrdenar ? ordem : 'padrao') : []
  const ir = (p: number) => {
    setParams((atual) => {
      const n = new URLSearchParams(atual)
      if (p > 1) n.set('pagina', String(p))
      else n.delete('pagina')
      return n
    })
    window.scrollTo({ top: 0 })
  }
  const mudarOrdem = (valor: string) =>
    setParams(
      (atual) => {
        const n = new URLSearchParams(atual)
        if (valor === 'padrao') n.delete('ordem')
        else n.set('ordem', valor)
        return n
      },
      { replace: true },
    )
  const sufixo = (() => {
    const n = new URLSearchParams()
    if (busca) n.set('busca', busca)
    if (ordem !== 'padrao') n.set('ordem', ordem)
    const s = n.toString()
    return s ? `?${s}` : ''
  })()
  const chip = (ativo: boolean) =>
    cn(
      'flex h-10 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca',
      ativo ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400',
    )

  return (
    <>
      <Container className="pt-5 lg:pt-12">
        <nav aria-label="Você está em" className="mb-3 truncate text-sm text-slate-500 max-sm:hidden lg:mb-4">
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
        <h1 className="vt-titulo text-2xl font-extrabold text-slate-900 sm:text-4xl">{categoria?.nome ?? 'Todos os produtos'}</h1>
      </Container>

      {/* Busca e categorias grudadas embaixo do topo enquanto rola */}
      <div className="sticky top-[3.75rem] z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl sm:top-[4.25rem] lg:top-20">
        <Container className="space-y-3 py-3">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <label htmlFor="busca-produtos" className="sr-only">
                {categoria ? `Buscar em ${categoria.nome}` : 'Buscar produtos'}
              </label>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-[1.125rem] w-[1.125rem] -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                ref={campo}
                id="busca-produtos"
                type="search"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                // Enter fecha o teclado do celular (a busca já roda enquanto digita)
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                placeholder={categoria ? `Buscar em ${categoria.nome}` : 'Buscar produtos'}
                maxLength={80}
                enterKeyHint="search"
                className="h-11 w-full rounded-full border border-transparent bg-slate-100 pl-11 pr-11 text-base text-slate-900 transition placeholder:text-slate-500 focus:border-marca focus:bg-white focus:outline-none focus:ring-4 focus:ring-marca/15 sm:text-[0.9375rem] [&::-webkit-search-cancel-button]:hidden"
              />
              {texto && (
                <button
                  type="button"
                  onClick={() => {
                    setTexto('')
                    campo.current?.focus()
                  }}
                  aria-label="Limpar busca"
                  className="absolute right-0.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {podeOrdenar && (
              <div className="relative shrink-0">
                <label htmlFor="ordem-produtos" className="sr-only">
                  Ordenar por
                </label>
                <ArrowUpDown className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                <select
                  id="ordem-produtos"
                  value={ordem}
                  onChange={(e) => mudarOrdem(e.target.value)}
                  className="h-11 w-11 appearance-none rounded-full border border-slate-200 bg-white pl-10 text-sm font-medium text-transparent focus:border-marca focus:outline-none focus:ring-4 focus:ring-marca/15 sm:w-auto sm:pr-4 sm:text-slate-700 [&>option]:text-slate-900"
                >
                  {ORDENS_PRODUTOS.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {categorias.length > 0 && (
            <div ref={faixa.ref} className={cn('vt-sem-barra -mx-4 flex gap-2 overflow-x-auto scroll-px-4 px-4 sm:mx-0 sm:px-0', classesFade(faixa))} role="list" aria-label="Filtrar por categoria">
              <Link role="listitem" to={`/produtos${sufixo}`} className={chip(!categoriaId)} aria-current={!categoriaId ? 'page' : undefined}>
                Todas
              </Link>
              {categorias.map((c) => (
                <Link
                  role="listitem"
                  key={c.id}
                  to={`/categoria/${c.id}${sufixo}`}
                  className={chip(c.id === categoriaId)}
                  aria-current={c.id === categoriaId ? 'page' : undefined}
                >
                  {c.nome} <span className={cn('ml-1.5 text-xs', c.id === categoriaId ? 'text-white/70' : 'text-slate-400')}>{c.quantidade}</span>
                </Link>
              ))}
            </div>
          )}
        </Container>
      </div>

      <Container>
        <p className="mt-4 text-sm text-slate-500 sm:mt-6" aria-live="polite">
          {consulta.data ? `${total} ${total === 1 ? 'produto' : 'produtos'}${busca ? ` para “${busca}”` : ''}` : 'Carregando…'}
        </p>
        <div className={cn('mt-4 transition-opacity sm:mt-6', consulta.isPlaceholderData && 'opacity-60')}>
          {consulta.isError ? (
            <div className="rounded-3xl border border-slate-200 px-6 py-16 text-center">
              <p className="font-semibold text-slate-900">Não foi possível carregar os produtos.</p>
              <p className="mt-1 text-slate-500">{consulta.error.message}</p>
              <button type="button" onClick={() => void consulta.refetch()} className={cn(botao.base, botao.escuro, botao.md, 'mt-6')}>
                Tentar de novo
              </button>
            </div>
          ) : !consulta.data ? (
            <GradeEsqueleto quantidade={8} />
          ) : produtos.length ? (
            <GradeProdutos produtos={produtos} prioridade={4} />
          ) : (
            <div className="flex flex-col items-center rounded-3xl bg-slate-50 px-6 py-14 text-center sm:py-20">
              <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
                <PackageSearch className="h-7 w-7" aria-hidden="true" />
              </span>
              <p className="vt-titulo text-xl font-extrabold text-slate-900">Nenhum produto encontrado</p>
              <p className="mt-2 max-w-md text-slate-600">
                {busca ? 'Tente outra palavra ou veja as categorias. Não achou? A gente faz sob medida: fale pelo WhatsApp.' : 'Ainda não há produtos nesta categoria.'}
              </p>
              <div className="mt-6 flex w-full flex-col justify-center gap-2 sm:w-auto sm:flex-row">
                {busca && (
                  <button type="button" onClick={() => setTexto('')} className={cn(botao.base, botao.contorno, botao.md)}>
                    <X /> Limpar busca
                  </button>
                )}
                {busca && wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(botao.base, botao.whatsapp, botao.md)}>
                    <IconeWhatsapp /> Perguntar no WhatsApp
                  </a>
                )}
                {!busca && (
                  <Link to="/produtos" className={cn(botao.base, botao.contorno, botao.md)}>
                    Ver todos os produtos
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
        <Paginacao atual={Math.min(pagina, paginas)} total={paginas} ir={ir} />
      </Container>
    </>
  )
}
