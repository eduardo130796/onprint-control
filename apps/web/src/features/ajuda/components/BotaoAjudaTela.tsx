import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CircleHelp, ExternalLink, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { tutorialDaTela } from '../conteudo'
import { TutorialConteudo } from './TutorialConteudo'

/**
 * Botão "Como usar" no cabeçalho das telas: abre, ao lado, o tutorial desta tela (vídeo e passo a passo),
 * sem sair do que a pessoa está fazendo. Sem tutorial para a tela, não aparece.
 */
export function BotaoAjudaTela() {
  const { pathname } = useLocation()
  const [aberto, setAberto] = useState(false)
  const t = tutorialDaTela(pathname)
  if (!t) return null
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setAberto(true)} title={`Como fazer: ${t.titulo}`}>
        <CircleHelp /> <span className="hidden sm:inline">Como usar</span>
        <span className="sr-only sm:hidden">Como usar esta tela</span>
      </Button>
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent className="left-auto right-0 w-[34rem] max-w-[100vw] overflow-y-auto data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-[92vw]">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card/95 px-5 py-3 backdrop-blur">
            <SheetTitle className="min-w-0 truncate font-titulo text-base font-extrabold text-tinta">{t.titulo}</SheetTitle>
            <div className="flex shrink-0 items-center gap-1">
              <Button asChild variant="ghost" size="sm">
                <Link to={`/ajuda/${t.slug}`} onClick={() => setAberto(false)}>
                  <ExternalLink /> Abrir
                </Link>
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setAberto(false)} aria-label="Fechar ajuda">
                <X />
              </Button>
            </div>
          </div>
          <div className="px-5 py-5">
            <p className="mb-6 text-sm text-texto-secundario">{t.resumo}</p>
            <TutorialConteudo t={t} compacto />
            <Link to="/ajuda" onClick={() => setAberto(false)} className="mt-8 inline-flex text-sm font-medium text-marca-escuro hover:underline">
              Ver todos os tutoriais
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
