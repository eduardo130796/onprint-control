import { useEffect, useMemo, useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { Outlet, RouterProvider, ScrollRestoration, createBrowserRouter } from 'react-router-dom'
import { RefreshCw, Store } from 'lucide-react'
import { TEMAS, temaOuPadrao } from '@onprint/shared'
import { aplicarTema, definirFavicon, gerarFavicon } from '@/features/aparencia/tema'
import { cn } from '@/lib/utils'
import { criarVitrineApi, naoEncontrado } from './api'
import { Container, Esqueleto, GradeEsqueleto } from './componentes/comum'
import { FeitoComGrafyGo, Rodape, Topo, WhatsappFlutuante } from './componentes/Estrutura'
import { VitrineContexto, criarLinkWhatsapp, definirMeta, useListaOrcamento, type ContextoVitrine } from './contexto'
import { botao } from './estilos'
import { descricaoLoja } from './seo'
import { InicioPagina } from './paginas/InicioPagina'
import { ListaPagina } from './paginas/ListaPagina'
import { NaoEncontradoPagina } from './paginas/NaoEncontradoPagina'
import { ProdutoPagina } from './paginas/ProdutoPagina'
import { ProdutosPagina } from './paginas/ProdutosPagina'
import './vitrine.css'

/** Tela inteira sem o site: vitrine fora do ar (404) ou falha ao carregar */
function TelaAviso({ titulo, texto, tentar }: { titulo: string; texto: string; tentar?: () => void }) {
  useEffect(() => {
    document.title = titulo
  }, [titulo])
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-white px-6 py-16 text-center">
      <span className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <Store className="h-8 w-8" aria-hidden="true" />
      </span>
      <h1 className="vt-titulo text-2xl font-extrabold text-slate-900 sm:text-3xl">{titulo}</h1>
      <p className="mt-3 max-w-md text-slate-600">{texto}</p>
      {tentar && (
        <button type="button" onClick={tentar} className={cn(botao.base, botao.escuro, botao.md, 'mt-8')}>
          <RefreshCw /> Tentar de novo
        </button>
      )}
      <FeitoComGrafyGo className="mt-16" />
    </main>
  )
}

function CarregandoSite() {
  return (
    <div role="status" aria-label="Carregando a vitrine">
      <div className="border-b border-slate-200">
        <Container className="flex h-[4.25rem] items-center gap-4 lg:h-20">
          <Esqueleto className="h-11 w-11 rounded-xl" />
          <Esqueleto className="h-5 w-40" />
          <Esqueleto className="ml-auto hidden h-11 w-full max-w-xl rounded-full md:block" />
          <Esqueleto className="ml-auto h-11 w-28 rounded-full md:ml-0" />
        </Container>
      </div>
      <Container className="py-6">
        <Esqueleto className="h-[22rem] rounded-[1.75rem] lg:h-[28rem]" />
        <div className="mt-16">
          <Esqueleto className="mb-8 h-8 w-64" />
          <GradeEsqueleto />
        </div>
      </Container>
    </div>
  )
}

function Estrutura({ slug }: { slug: string }) {
  const api = useMemo(() => criarVitrineApi(slug), [slug])
  const consulta = useQuery({ queryKey: ['vitrine', slug], queryFn: api.inicio, retry: (n, erro) => !naoEncontrado(erro) && n < 2 })
  const lista = useListaOrcamento(slug)
  const [mensagemPagina, definirMensagemPagina] = useState<string | null>(null)
  const vitrine = consulta.data

  // Cara da gráfica: cor do tema, título e ícone da aba; sempre no modo claro
  useEffect(() => {
    document.documentElement.classList.remove('dark')
    if (!vitrine) return
    const e = vitrine.empresa
    aplicarTema(e.corTema)
    const tema = TEMAS[temaOuPadrao(e.corTema)]
    definirMeta('theme-color', tema.cor)
    definirMeta('description', descricaoLoja(e))
    let vivo = true
    void gerarFavicon({ logoUrl: e.logoUrl, nome: e.nome, cor: tema.cor, contraste: tema.contraste }).then((url) => {
      if (vivo) definirFavicon(url)
    })
    return () => {
      vivo = false
    }
  }, [vitrine])

  const contexto = useMemo<ContextoVitrine | null>(
    () => (vitrine ? { slug, api, vitrine, lista, whatsapp: criarLinkWhatsapp(vitrine), mensagemPagina, definirMensagemPagina } : null),
    [slug, api, vitrine, lista, mensagemPagina],
  )

  if (consulta.isPending) return <CarregandoSite />
  if (naoEncontrado(consulta.error)) {
    return <TelaAviso titulo="Vitrine indisponível" texto="Este site não está no ar no momento. Se você procura esta empresa, tente novamente mais tarde." />
  }
  if (!contexto) {
    return <TelaAviso titulo="Não foi possível abrir o site" texto={consulta.error?.message ?? 'Tente de novo em instantes.'} tentar={() => void consulta.refetch()} />
  }
  return (
    <VitrineContexto.Provider value={contexto}>
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Pular para o conteúdo
      </a>
      <div className="flex min-h-screen flex-col bg-white text-slate-900">
        <Topo />
        <main id="conteudo" className="flex-1">
          <Outlet />
        </main>
        <Rodape />
      </div>
      <WhatsappFlutuante />
      <ScrollRestoration />
    </VitrineContexto.Provider>
  )
}

// O site da gráfica tem fonte maior que o sistema (ver vitrine.css)
document.documentElement.dataset.app = 'vitrine'

/** App da vitrine online (site público da gráfica), carregado pelo main.tsx no endereço {slug}.{domínio} */
export function VitrineApp({ slug }: { slug: string }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 } } }))
  const [router] = useState(() =>
    createBrowserRouter([
      {
        element: <Estrutura slug={slug} />,
        children: [
          { index: true, element: <InicioPagina /> },
          { path: 'produtos', element: <ProdutosPagina /> },
          { path: 'categoria/:id', element: <ProdutosPagina /> },
          { path: 'produto/:produtoSlug', element: <ProdutoPagina /> },
          { path: 'lista', element: <ListaPagina /> },
          { path: '*', element: <NaoEncontradoPagina /> },
        ],
      },
    ]),
  )
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </QueryClientProvider>
  )
}
