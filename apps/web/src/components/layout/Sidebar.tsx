import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
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

/** Assinatura discreta do sistema (a marca em destaque é a da gráfica). */
function PorOnprint() {
  return (
    <div className="flex items-center gap-1.5 border-t border-border px-6 py-2.5 text-[11px] text-texto-secundario">
      por <Logo compacto className="[&_svg]:h-4 [&_svg]:w-4" /> <span className="font-titulo font-bold">ONPrint Control</span>
    </div>
  )
}

/** Sidebar fixa no desktop (recolhível) e drawer no celular. */
export function Sidebar({ recolhida, onAlternar, mobileAberta, onMobileAbertaChange }: SidebarProps) {
  return (
    <>
      <aside
        className={cn(
          'fixed bottom-0 left-0 top-16 z-30 hidden flex-col border-r border-border bg-card transition-[width] duration-200 lg:flex',
          recolhida ? 'w-[72px]' : 'w-64',
        )}
      >
        <div className="flex-1 overflow-y-auto">
          <SidebarNav recolhida={recolhida} />
        </div>
        {!recolhida && <PorOnprint />}
        <button
          type="button"
          onClick={onAlternar}
          className="flex items-center gap-2 border-t border-border px-6 py-3 text-sm text-texto-secundario hover:text-grafite"
          aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
        >
          {recolhida ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          {!recolhida && 'Recolher menu'}
        </button>
      </aside>

      <Sheet open={mobileAberta} onOpenChange={onMobileAbertaChange}>
        <SheetContent>
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="flex h-16 items-center bg-grafite px-4">
            <MarcaEmpresa />
          </div>
          <div className="flex-1 overflow-y-auto">
            <SidebarNav onNavegar={() => onMobileAbertaChange(false)} />
          </div>
          <PorOnprint />
        </SheetContent>
      </Sheet>
    </>
  )
}
