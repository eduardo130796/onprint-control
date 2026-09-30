import { Link, useLocation } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { paginaAtual } from '@/app/navigation'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePermissoes } from '@/hooks/usePermission'

/** Botão "+" contextual: abre o novo registro do módulo atual (se o usuário puder criar). */
export function FloatingActionButton() {
  const { pathname } = useLocation()
  const pode = usePermissoes()
  const pagina = paginaAtual(pathname)
  if (!pagina?.novo || pathname !== pagina.path || !pode(pagina.modulo, 'criar')) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={`${pagina.path}/novo`}
          aria-label={pagina.novo}
          className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-turquesa-escuro text-white shadow-lg transition-transform hover:scale-105 hover:bg-turquesa-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-turquesa/40"
        >
          <Plus className="h-7 w-7" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="left">{pagina.novo}</TooltipContent>
    </Tooltip>
  )
}
