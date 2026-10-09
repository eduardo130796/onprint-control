import { LogOut, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

/** Aviso de 1 minuto antes de sair por inatividade. Enquanto aberto, mexer o mouse não fecha (precisa escolher). */
export function AvisoInatividade({ restanteMs, onContinuar, onSair }: { restanteMs: number | null; onContinuar: () => void; onSair: () => void }) {
  const segundos = restanteMs === null ? 0 : Math.max(0, Math.ceil(restanteMs / 1000))
  return (
    <Dialog open={restanteMs !== null} onOpenChange={(aberto) => !aberto && onContinuar()}>
      <DialogContent className="max-w-md">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="font-titulo text-xl font-extrabold text-tinta">Você ainda está aí?</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-texto-secundario">
              Por segurança, o sistema sai sozinho depois de um tempo sem uso. Saindo em{' '}
              <strong className="tabular-nums text-tinta" aria-live="polite">
                {segundos} {segundos === 1 ? 'segundo' : 'segundos'}
              </strong>
              .
            </DialogDescription>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onSair}>
            <LogOut /> Sair agora
          </Button>
          <Button onClick={onContinuar} autoFocus>
            Continuar conectado
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
