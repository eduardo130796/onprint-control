import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MARCA, anosDireitos } from '@/app/marca'
import { Logo } from '@/components/layout/Logo'
import { ListaAjuda, PaginaTutorial } from '@/features/ajuda/components/CentralAjuda'
import { tutorialPorSlug } from '@/features/ajuda/conteudo'
import { linkCadastro, usePlanosPublicos } from '../dados'

/** Moldura simples das páginas de ajuda no site (logo, "Testar grátis" e rodapé) */
function Moldura({ children }: { children: React.ReactNode }) {
  const { dados } = usePlanosPublicos()
  return (
    <div className="min-h-screen bg-[#F5F8FC] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" aria-label={`${MARCA.produto}: início`}>
            <Logo className="h-8" />
          </Link>
          <Link to="/ajuda" className="hidden text-sm font-semibold text-slate-600 hover:text-slate-900 sm:inline">
            Central de ajuda
          </Link>
          <a href={linkCadastro(dados)} className="ml-auto inline-flex h-10 items-center rounded-full bg-[#0265DC] px-5 text-sm font-bold text-white transition hover:bg-[#024DCC]">
            Testar grátis
          </a>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:px-6">
          <p>
            © {anosDireitos()} {MARCA.empresa} · Todos os direitos reservados
          </p>
          <p className="flex gap-4">
            <Link to="/termos" className="hover:underline">
              Termos de uso
            </Link>
            <Link to="/privacidade" className="hover:underline">
              Privacidade
            </Link>
          </p>
        </div>
      </footer>
    </div>
  )
}

/** grafygo.com.br/ajuda: tutoriais públicos (ajudam a decidir e aparecem no Google) */
export function AjudaSite() {
  useEffect(() => {
    document.title = `Central de ajuda · ${MARCA.produto}`
    window.scrollTo(0, 0)
  }, [])
  return (
    <Moldura>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0265DC]">Central de ajuda</p>
      <h1 className="mt-2 font-titulo text-3xl font-extrabold text-[#021A40] sm:text-4xl">Aprenda a usar a GrafyGo em minutos</h1>
      <p className="mt-3 max-w-2xl text-lg text-slate-600">Passo a passo com as telas de verdade e vídeos curtos de cada tarefa, do primeiro orçamento à vitrine no WhatsApp.</p>
      <div className="mt-10">
        <ListaAjuda />
      </div>
    </Moldura>
  )
}

export function TutorialSite() {
  const { slug } = useParams()
  const t = tutorialPorSlug(slug)
  useEffect(() => {
    document.title = t ? `${t.titulo} · Ajuda ${MARCA.produto}` : `Ajuda · ${MARCA.produto}`
    document.querySelector('meta[name="description"]')?.setAttribute('content', t?.resumo ?? '')
    window.scrollTo(0, 0)
  }, [t])
  return (
    <Moldura>
      <PaginaTutorial slug={slug} />
    </Moldura>
  )
}
