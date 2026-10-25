import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/ui/sheet'

interface GavetaProps {
  aberta: boolean
  onAbertaChange: (aberta: boolean) => void
  titulo: ReactNode
  children: ReactNode
}

/** Gaveta à direita para o que é de vez em quando ("Testar", "ver detalhes"): no celular ocupa a tela toda */
export function Gaveta({ aberta, onAbertaChange, titulo, children }: GavetaProps) {
  return (
    <Sheet open={aberta} onOpenChange={onAbertaChange}>
      <SheetContent lado="direita" className="w-full max-w-full sm:w-[30rem] sm:max-w-[90vw]">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <SheetTitle className="text-base font-semibold text-tinta">{titulo}</SheetTitle>
          <SheetClose className="rounded-lg p-1.5 text-texto-secundario hover:bg-accent hover:text-tinta" aria-label="Fechar">
            <X className="h-5 w-5" />
          </SheetClose>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
