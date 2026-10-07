import { LogOut, Menu } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { BuscaGlobal } from './BuscaGlobal'
import { Logo } from './Logo'
import { Notificacoes } from './Notificacoes'
import { UserMenu } from './UserMenu'

interface TopbarProps {
  onAbrirMenuMobile: () => void
}

export function Topbar({ onAbrirMenuMobile }: TopbarProps) {
  const { sair } = useAuth()

  async function onSair() {
    try {
      await sair()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center gap-2 bg-grafite px-3 shadow-md sm:gap-4 sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="text-white hover:bg-white/10 hover:text-white lg:hidden"
        onClick={onAbrirMenuMobile}
        aria-label="Abrir menu"
      >
        <Menu className="!size-5" />
      </Button>
      <div className="lg:w-56">
        <Logo claro className="hidden sm:flex" />
        <Logo claro compacto className="sm:hidden" />
      </div>

      <div className="flex flex-1 justify-center">
        <BuscaGlobal />
      </div>

      <div className="flex items-center gap-1">
        <Notificacoes />
        <UserMenu />
        <Button
          variant="ghost"
          size="sm"
          className="hidden border border-white/25 text-white hover:border-white/50 hover:bg-white/10 hover:text-white sm:inline-flex"
          onClick={() => void onSair()}
        >
          <LogOut /> Sair
        </Button>
      </div>
      {/* Faixa da marca (a mesma dos documentos): verde WhatsApp com a lasca laranja */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[3px]" aria-hidden="true">
        <div className="flex-[9] bg-marca" />
        <div className="flex-1 bg-laranja" />
      </div>
    </header>
  )
}
