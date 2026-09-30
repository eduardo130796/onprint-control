import { useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { filtrarNavegacao, type NavModulo } from '@/app/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useContagemAlertas } from '@/features/estoque/hooks'
import { usePermissoes } from '@/hooks/usePermission'
import { cn } from '@/lib/utils'

interface SidebarNavProps {
  recolhida?: boolean
  onNavegar?: () => void
}

const itemBase =
  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const itemInativo = 'text-texto-secundario hover:bg-fundo hover:text-petroleo'
const itemAtivo = 'bg-petroleo text-white hover:bg-petroleo'

/** Contador vermelho ao lado do item (ex.: alertas de estoque baixo). */
function Contador({ valor, className }: { valor?: number; className?: string }) {
  if (!valor) return null
  return (
    <span className={cn('min-w-5 rounded-full bg-coral-escuro px-1.5 text-center text-[11px] font-semibold leading-5 text-white', className)} aria-label={`${valor} pendente(s)`}>
      {valor > 99 ? '99+' : valor}
    </span>
  )
}

function moduloAtivo(modulo: NavModulo, pathname: string) {
  return modulo.filhos?.some((f) => pathname === f.path || pathname.startsWith(`${f.path}/`)) ?? false
}

export function SidebarNav({ recolhida = false, onNavegar }: SidebarNavProps) {
  const { pathname } = useLocation()
  const [abertos, setAbertos] = useState<Record<string, boolean>>({})
  const pode = usePermissoes()
  const itens = useMemo(() => filtrarNavegacao((m) => pode(m)), [pode])
  const alertasEstoque = useContagemAlertas()
  const badges: Record<string, number | undefined> = { '/estoque/alertas': alertasEstoque.data }
  const badgeDoModulo = (m: NavModulo) => m.filhos?.reduce((s, f) => s + (badges[f.path] ?? 0), 0)

  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Menu principal">
      {itens.map((modulo) => {
        const Icone = modulo.icone
        const ativo = moduloAtivo(modulo, pathname)

        if (!modulo.filhos) {
          const link = (
            <NavLink
              key={modulo.modulo}
              to={modulo.path ?? '/'}
              end={modulo.path === '/'}
              onClick={onNavegar}
              className={({ isActive }) =>
                cn(itemBase, isActive ? itemAtivo : itemInativo, recolhida && 'justify-center px-0')
              }
            >
              <Icone className="h-5 w-5 shrink-0" />
              {!recolhida && <span className="truncate">{modulo.titulo}</span>}
            </NavLink>
          )
          return recolhida ? (
            <Tooltip key={modulo.modulo}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{modulo.titulo}</TooltipContent>
            </Tooltip>
          ) : (
            link
          )
        }

        // Sidebar recolhida: submódulos abrem em um menu flutuante ao lado
        if (recolhida) {
          return (
            <DropdownMenu key={modulo.modulo}>
              <DropdownMenuTrigger
                className={cn(itemBase, 'justify-center px-0', ativo ? itemAtivo : itemInativo)}
                aria-label={modulo.titulo}
              >
                <span className="relative">
                  <Icone className="h-5 w-5 shrink-0" />
                  {Boolean(badgeDoModulo(modulo)) && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-coral ring-2 ring-card" />}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start">
                <DropdownMenuLabel className="font-semibold text-petroleo">{modulo.titulo}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {modulo.filhos.map((f) => (
                  <DropdownMenuItem key={f.path} asChild>
                    <NavLink to={f.path} end className="flex items-center justify-between gap-3">
                      {f.titulo}
                      <Contador valor={badges[f.path]} />
                    </NavLink>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }

        const aberto = abertos[modulo.modulo] ?? ativo
        return (
          <div key={modulo.modulo}>
            <button
              type="button"
              onClick={() => setAbertos((a) => ({ ...a, [modulo.modulo]: !aberto }))}
              className={cn(itemBase, ativo ? 'text-petroleo' : itemInativo)}
              aria-expanded={aberto}
            >
              <Icone className="h-5 w-5 shrink-0" />
              <span className="flex-1 truncate text-left">{modulo.titulo}</span>
              {!aberto && <Contador valor={badgeDoModulo(modulo)} />}
              <ChevronDown className={cn('h-4 w-4 transition-transform', aberto && 'rotate-180')} />
            </button>
            {aberto && (
              <div className="ml-5 mt-1 flex flex-col gap-0.5 border-l border-border pl-3">
                {modulo.filhos.map((f) => (
                  <NavLink
                    key={f.path}
                    to={f.path}
                    end
                    onClick={onNavegar}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-accent font-medium text-petroleo'
                          : 'text-texto-secundario hover:bg-fundo hover:text-petroleo',
                      )
                    }
                  >
                    {f.titulo}
                    <Contador valor={badges[f.path]} />
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}
