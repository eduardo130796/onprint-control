import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { MarcaEmpresa } from './MarcaEmpresa'
import { SidebarNav } from './SidebarNav'
import { AssinaturaSistema } from './SobreSistema'

interface SidebarProps {
  recolhida: boolean
  /** Com menu lateral (a partir de 1024 px) dá para recolher/expandir; no celular é a gaveta */
  podeAlternar: boolean
  onAlternar: () => void
  mobileAberta: boolean
  onMobileAbertaChange: (aberta: boolean) => void
}

/** Sidebar fixa no desktop (recolhível) e drawer no celular. */
export function Sidebar({ recolhida, podeAlternar, onAlternar, mobileAberta, onMobileAbertaChange }: SidebarProps) {
  return (
    <>
      <aside
        className={cn(
          'fixed bottom-0 left-0 top-16 z-30 hidden overflow-hidden transition-[width] duration-200 lg:block',
          recolhida ? 'w-[4.75rem]' : 'w-[18.75rem]',
        )}
      >
        <SidebarNav recolhida={recolhida} onAlternar={podeAlternar ? onAlternar : undefined} rodape={<AssinaturaSistema />} />
      </aside>


      <Sheet open={mobileAberta} onOpenChange={onMobileAbertaChange}>
        <SheetContent className="w-[18.75rem]">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="flex h-16 items-center bg-grafite px-4">
            <MarcaEmpresa />
          </div>
          <div className="min-h-0 flex-1">
            <SidebarNav onNavegar={() => onMobileAbertaChange(false)} rodape={<AssinaturaSistema />} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
