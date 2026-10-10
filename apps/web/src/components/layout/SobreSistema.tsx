import { abrirSobreSistema, anosDireitos, MARCA } from '@/app/marca'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/hooks/useAuth'
import { Logo } from './Logo'

/** Assinatura discreta do sistema no rodapé do menu: nome do produto e direitos; abre "Sobre o sistema". */
export function AssinaturaSistema() {
  return (
    <button
      type="button"
      onClick={abrirSobreSistema}
      className="group w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-fundo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Sobre o ${MARCA.produto}`}
    >
      <span className="block text-[0.6875rem] font-semibold text-texto-secundario transition-colors group-hover:text-tinta">
        {MARCA.produto}
      </span>
      <span className="block text-[0.625rem] leading-snug text-texto-secundario/70">
        © {anosDireitos()} {MARCA.empresa} · Todos os direitos reservados
      </span>
    </button>
  )
}

/** Janela "Sobre o sistema": produto, para quem está licenciado, autoria e direitos autorais. */
export function SobreSistema({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { usuario } = useAuth()
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-sm gap-0 overflow-hidden p-0">
        <div className="bg-grafite px-6 pb-6 pt-7">
          <Logo claro className="h-11" />
          <DialogDescription className="mt-3 text-sm text-white/70">
            {MARCA.slogan}
            <span className="mt-0.5 block text-xs text-white/50">{MARCA.descricao}.</span>
          </DialogDescription>
        </div>
        <div className="space-y-4 px-6 py-5 text-sm">
          <DialogTitle className="sr-only">Sobre o {MARCA.produto}</DialogTitle>
          <dl className="space-y-3">
            {usuario && (
              <div>
                <dt className="text-xs text-texto-secundario">Licenciado para</dt>
                <dd className="font-medium text-tinta">
                  {usuario.empresa.exibicao}
                  {usuario.assinatura && <span className="font-normal text-texto-secundario"> · plano {usuario.assinatura.plano}</span>}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-texto-secundario">Desenvolvido por</dt>
              <dd className="font-medium text-tinta">{MARCA.empresa}</dd>
            </div>
          </dl>
          <p className="border-t border-border pt-4 text-xs leading-relaxed text-texto-secundario">
            © {anosDireitos()} {MARCA.empresa}. Todos os direitos reservados. O {MARCA.produto}, sua marca, código e interface são protegidos pela
            Lei de Direitos Autorais (Lei nº 9.610/98) e pela Lei de Software (Lei nº 9.609/98). O uso é licenciado pelo contrato de assinatura.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
