import { ChevronLeft } from 'lucide-react'
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

      {/* Recolher/expandir: aba presa à borda do menu, da mesma cor e borda da superfície (painel claro ou trilho
          escuro), como uma extensão dele; discreta até passar o mouse. Atalho Ctrl+B */}
      {podeAlternar && (
        <button
          type="button"
          onClick={onAlternar}
          aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
          aria-expanded={!recolhida}
          title={`${recolhida ? 'Expandir' : 'Recolher'} menu (Ctrl+B)`}
          className={cn(
            'group fixed top-[5.25rem] z-30 hidden h-11 w-[1.125rem] items-center justify-center rounded-r-lg transition-[left,background-color,color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex',
            recolhida
              ? 'left-[4.75rem] bg-grafite text-white/45 hover:text-white'
              : 'left-[calc(18.75rem-1px)] border border-l-0 border-border bg-card text-texto-secundario/60 hover:bg-fundo hover:text-tinta',
          )}
        >
          <ChevronLeft className={cn('h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-px', recolhida && 'rotate-180 group-hover:translate-x-px')} strokeWidth={2.4} />
        </button>
      )}


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
