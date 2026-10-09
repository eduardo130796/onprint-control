import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { Logo } from './Logo'
import { MarcaEmpresa } from './MarcaEmpresa'
import { SidebarNav } from './SidebarNav'

interface SidebarProps {
  recolhida: boolean
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
export function Sidebar({ recolhida, onAlternar, mobileAberta, onMobileAbertaChange }: SidebarProps) {
  return (
    <>
      <aside
        className={cn(
          'fixed bottom-0 left-0 top-16 z-30 hidden overflow-hidden transition-[width] duration-200 lg:block',
          recolhida ? 'w-[76px]' : 'w-[300px]',
        )}
      >
        <SidebarNav recolhida={recolhida} onAlternar={onAlternar} rodape={<SimboloOnprint />} />
      </aside>

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
