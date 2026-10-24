import { useEffect } from 'react'
import { Navigate, RouterProvider, createBrowserRouter, useLocation } from 'react-router-dom'
import { MARCA } from '@/app/marca'
import { PrivacidadePage, TermosPage } from '@/features/legal/PaginaLegal'
import { AjudaSite, TutorialSite } from './paginas/AjudaSite'
import { InicioSite } from './paginas/InicioSite'
import './site.css'

const TITULO = `${MARCA.produto} · Sistema para gráficas com orçamento e avisos pelo WhatsApp`
const DESCRICAO =
  'Sistema de gestão para gráficas e comunicação visual: orçamento enviado e aprovado pelo WhatsApp, pedido automático, arte, produção, avisos ao cliente, estoque, financeiro e vitrine online. Teste grátis por 14 dias.'

/** Título e descrição da página de venda (o index.html é o mesmo do sistema) */
function Seo() {
  const { pathname } = useLocation()
  useEffect(() => {
    if (pathname !== '/') return
    document.title = TITULO
    document.querySelector('meta[name="description"]')?.setAttribute('content', DESCRICAO)
  }, [pathname])
  return null
}

const voltar = { rotulo: 'Voltar ao site', para: '/' }

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <>
        <Seo />
        <InicioSite />
      </>
    ),
  },
  { path: '/ajuda', element: <AjudaSite /> },
  { path: '/ajuda/:slug', element: <TutorialSite /> },
  { path: '/termos', element: <TermosPage voltar={voltar} /> },
  { path: '/privacidade', element: <PrivacidadePage voltar={voltar} /> },
  { path: '*', element: <Navigate to="/" replace /> },
])

/** grafygo.com.br (e www): a página de venda da GrafyGo. O sistema fica em app.grafygo.com.br. */
export function SiteGrafygoApp() {
  useEffect(() => {
    document.documentElement.dataset.app = 'site'
  }, [])
  return <RouterProvider router={router} />
}
