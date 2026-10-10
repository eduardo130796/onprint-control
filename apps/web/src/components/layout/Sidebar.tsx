import { ChevronLeft } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Logo } from './Logo'
import { MarcaEmpresa } from './MarcaEmpresa'
import { SidebarNav } from './SidebarNav'

interface SidebarProps {
  recolhida: boolean
  /** Só em telas largas dá para expandir (abaixo de 1280 px fica sempre o trilho) */
  podeAlternar: boolean
  onAlternar: () => void
  mobileAberta: boolean
  onMobileAbertaChange: (aberta: boolean) => void
}

/** Assinatura discreta do sistema: só o símbolo (a marca em destaque é a da gráfica); o nome aparece no hover. */
function SimboloOnprint({ className }: { className?: string }) {
  return (
    <span title="Feito com ONPrint Control" aria-label="Feito com ONPrint Control" className={cn('opacity-60 transition-opacity hover:opacity-100', className)}>
      <Logo compacto className="[&_svg]:h-5 [&_svg]:w-5" />
    </span>
  )
}

/** Sidebar fixa no desktop (recolhível) e drawer no celular. */
export function Sidebar({ recolhida, podeAlternar, onAlternar, mobileAberta, onMobileAbertaChange }: SidebarProps) {
  return (
    <>
      <aside
        className={cn(
          'fixed bottom-0 left-0 top-16 z-30 hidden overflow-hidden transition-[width] duration-200 lg:block',
          recolhida ? 'w-[76px]' : 'w-[300px]',
        )}
      >
        <SidebarNav recolhida={recolhida} rodape={<SimboloOnprint />} />
      </aside>

      {/* Recolher/expandir: botão redondo na borda do menu, como nos sistemas mais usados */}
      {podeAlternar && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onAlternar}
              aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
              aria-expanded={!recolhida}
              className={cn(
                'fixed top-[84px] z-40 hidden h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-texto-secundario shadow-[0_2px_8px_rgba(16,24,40,0.12)] transition-[left,color,transform] duration-200 hover:scale-110 hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex',
                recolhida ? 'left-[76px]' : 'left-[300px]',
              )}
            >
              <ChevronLeft className={cn('h-4 w-4 transition-transform duration-200', recolhida && 'rotate-180')} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {recolhida ? 'Expandir menu' : 'Recolher menu'} <kbd className="ml-1 rounded border border-white/20 px-1 text-[10px]">Ctrl B</kbd>
          </TooltipContent>
        </Tooltip>
      )}

      <Sheet open={mobileAberta} onOpenChange={onMobileAbertaChange}>
        <SheetContent className="w-[300px]">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="flex h-16 items-center bg-grafite px-4">
            <MarcaEmpresa />
          </div>
          <div className="min-h-0 flex-1">
            <SidebarNav onNavegar={() => onMobileAbertaChange(false)} rodape={<SimboloOnprint />} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
