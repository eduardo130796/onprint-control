import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BuscaGlobal } from './BuscaGlobal'
import { MarcaEmpresa } from './MarcaEmpresa'
import { Notificacoes } from './Notificacoes'
import { UserMenu } from './UserMenu'

interface TopbarProps {
  onAbrirMenuMobile: () => void
  /** Menu só com o trilho: a marca não reserva a largura do painel */
  menuRecolhido: boolean
}

/**
 * Barra do topo: marca da empresa (na largura do menu, para a busca alinhar com o conteúdo), busca e,
 * à direita, só notificações e a conta (o plano fica no menu da conta).
 */
export function Topbar({ onAbrirMenuMobile, menuRecolhido }: TopbarProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center bg-grafite pl-2 pr-3 shadow-[0_1px_0_rgba(255,255,255,0.06),0_8px_24px_-12px_rgba(0,0,0,0.5)] sm:pl-4 sm:pr-4">
      <button
        type="button"
        className="mr-1 flex h-10 w-10 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 lg:hidden"
        onClick={onAbrirMenuMobile}
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Marca: no desktop ocupa a largura do menu (300 px − margem) */}
      {/* Marca: tem prioridade (o nome não é cortado); no desktop com menu aberto, ocupa ao menos a largura do menu */}
      <div className={cn('flex min-w-0 shrink-0 items-center', !menuRecolhido && 'lg:min-w-[17.75rem]')}>
        <MarcaEmpresa />
      </div>

      {/* Busca: usa o espaço que sobrar (no celular, só a lupa) */}
      <div className={cn('flex min-w-0 flex-1 items-center justify-end px-1 sm:px-3 md:justify-start', !menuRecolhido && 'lg:pl-8 lg:pr-6')}>
        <BuscaGlobal />
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <Notificacoes />
        <span className="mx-1 hidden h-6 w-px bg-white/10 sm:block" aria-hidden="true" />
        <UserMenu />
      </div>

      {/* Faixa da marca (a mesma dos documentos), fina: cor do tema com a lasca laranja */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[0.125rem]" aria-hidden="true">
        <div className="flex-[9] bg-marca transition-colors" />
        <div className="flex-1 bg-laranja" />
      </div>
    </header>
  )
}
