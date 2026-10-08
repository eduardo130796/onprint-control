import type { ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Loader2, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PainelCartaoProps {
  aberto: boolean
  onFechar: () => void
  titulo: ReactNode
  subtitulo?: ReactNode
  /** Botões de ação rápida, logo abaixo do título */
  acoes?: ReactNode
  children: ReactNode
}

/** Painel lateral (direita) aberto ao clicar num cartão do kanban: detalhes + ações rápidas. */
export function PainelCartao({ aberto, onFechar, titulo, subtitulo, acoes, children }: PainelCartaoProps) {
  return (
    <DialogPrimitive.Root open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex h-full w-[480px] max-w-[100vw] flex-col bg-card shadow-suave data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
        >
          <header className="flex items-start gap-3 border-b border-border px-5 pb-4 pt-5">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="truncate text-lg font-semibold text-grafite">{titulo}</DialogPrimitive.Title>
              {subtitulo && <div className="mt-1 text-sm text-texto-secundario">{subtitulo}</div>}
            </div>
            <DialogPrimitive.Close className="rounded-md p-1.5 text-texto-secundario hover:bg-fundo hover:text-grafite focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca" aria-label="Fechar">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </header>
          {acoes && <div className="grid grid-cols-2 gap-2 border-b border-border px-5 py-4 sm:grid-cols-3">{acoes}</div>}
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

interface AcaoPainelProps {
  icone: LucideIcon
  rotulo: string
  onClick: () => void
  carregando?: boolean
  destaque?: boolean
}

/** Botão de ação rápida do painel (ícone em cima, rótulo embaixo). */
export function AcaoPainel({ icone: Icone, rotulo, onClick, carregando, destaque }: AcaoPainelProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={carregando}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca disabled:opacity-60',
        destaque ? 'border-transparent bg-marca font-semibold text-marca-contraste hover:bg-marca-hover' : 'border-border bg-card text-grafite hover:bg-fundo',
      )}
    >
      {carregando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icone className="h-5 w-5" />}
      {rotulo}
    </button>
  )
}

/** Bloco "rótulo: valor" do painel. */
export function DadoPainel({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-texto-secundario">{rotulo}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  )
}
