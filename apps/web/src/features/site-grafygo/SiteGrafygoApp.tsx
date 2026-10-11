import { useEffect } from 'react'
import { Navigate, RouterProvider, createBrowserRouter, useLocation } from 'react-router-dom'
import { MARCA } from '@/app/marca'
import { PrivacidadePage, TermosPage } from '@/features/legal/PaginaLegal'
import { InicioSite } from './paginas/InicioSite'
import './site.css'

const TITULO = `${MARCA.produto} · Sistema de gestão para gráficas e comunicação visual`
const DESCRICAO =
  'Orçamentos, pedidos, aprovação de arte, produção, estoque e financeiro para gráficas e comunicação visual, com vitrine online para vender pelo WhatsApp. Teste grátis por 14 dias.'

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
