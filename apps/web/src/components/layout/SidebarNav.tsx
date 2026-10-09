import { Fragment, useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { agruparPorSecao, filtrarNavegacao, type NavLeaf } from '@/app/navigation'
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
import { useContagemReajuste } from '@/features/produtos/hooks'
import { usePermissoes } from '@/hooks/usePermission'
import { cn } from '@/lib/utils'

interface SidebarNavProps {
  recolhida?: boolean
  onNavegar?: () => void
}

type ItemMenu = ReturnType<typeof filtrarNavegacao>[number]

const itemBase =
  'group relative flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-[13.5px] font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const itemInativo = 'text-tinta/75 hover:bg-fundo hover:text-tinta'
// Item ativo: grafite com um traço laranja à esquerda (detalhe da identidade)
const itemAtivo =
  'bg-grafite text-white shadow-[0_6px_16px_-8px_rgba(0,0,0,0.45)] hover:bg-grafite before:absolute before:inset-y-2 before:-left-3 before:w-1 before:rounded-r-full before:bg-laranja'

type EstadoIcone = 'normal' | 'ativo' | 'aberto'

/** Ícone do item num quadradinho: neutro; tom da marca no hover/grupo aberto; cor da marca no ativo. */
function IconeMenu({ icone: Icone, estado }: { icone: LucideIcon; estado: EstadoIcone }) {
  return (
    <span
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
        estado === 'ativo'
          ? 'bg-marca text-marca-contraste shadow-sm'
          : estado === 'aberto'
            ? 'bg-marca-suave text-marca-escuro'
            : 'bg-fundo text-tinta/80 group-hover:bg-marca-suave group-hover:text-marca-escuro',
      )}
    >
      <Icone className="h-[17px] w-[17px]" strokeWidth={2.1} />
    </span>
  )
}

/** Contador laranja ao lado do item (ex.: alertas de estoque baixo). */
function Contador({ valor, className }: { valor?: number; className?: string }) {
  if (!valor) return null
  return (
    <span
      className={cn('min-w-5 rounded-full bg-laranja-escuro px-1.5 text-center text-[11px] font-bold leading-5 text-white tabular-nums', className)}
      aria-label={`${valor} pendente(s)`}
    >
      {valor > 99 ? '99+' : valor}
    </span>
  )
}

const naRota = (path: string, pathname: string) => (path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`))

/** O item (ou alguma das suas telas: subitens ou abas) é a tela atual */
function itemAtivoNaRota(item: ItemMenu, pathname: string) {
  const telas = item.filhos ?? item.abas ?? []
  return (item.path ? naRota(item.path, pathname) : false) || telas.some((f) => naRota(f.path, pathname))
}

/** Título pequeno da seção (some na sidebar recolhida, que mostra só um divisor) */
function TituloSecao({ titulo, recolhida, primeira }: { titulo: string; recolhida: boolean; primeira: boolean }) {
  if (primeira && !titulo) return null
  if (recolhida) return <div className="mx-auto my-2 h-px w-8 bg-border" aria-hidden />
  return (
    <div className="flex items-center gap-2 px-2 pb-1.5 pt-5">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-texto-secundario/80">{titulo}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" aria-hidden />
    </div>
  )
}

export function SidebarNav({ recolhida = false, onNavegar }: SidebarNavProps) {
  const { pathname } = useLocation()
  const pode = usePermissoes()
  const itens = useMemo(() => filtrarNavegacao((m, a) => pode(m, a)), [pode])
  const secoes = useMemo(() => agruparPorSecao(itens), [itens])
  const alertasEstoque = useContagemAlertas()
  const reajuste = useContagemReajuste()
  const badges: Record<string, number | undefined> = { '/estoque/alertas': alertasEstoque.data, '/produtos/reajuste': reajuste.data }
  const badgeDe = (telas?: NavLeaf[]) => telas?.reduce((s, f) => s + (badges[f.path] ?? 0), 0)

  // Acordeão: um grupo aberto por vez; ao navegar, abre o grupo da tela atual
  const grupoDaRota = itens.find((m) => m.filhos && itemAtivoNaRota(m, pathname))?.modulo ?? null
  const [aberto, setAberto] = useState<string | null>(grupoDaRota)
  useEffect(() => setAberto(grupoDaRota), [grupoDaRota])

  return (
    <nav className="flex flex-col px-3 pb-4 pt-2" aria-label="Menu principal">
      {secoes.map((secao, i) => (
        <Fragment key={secao.secao}>
          <TituloSecao titulo={secao.titulo} recolhida={recolhida} primeira={i === 0} />
          <ul className="flex flex-col gap-0.5" aria-label={secao.titulo || undefined}>
            {secao.itens.map((item) => (
              <li key={item.modulo}>
                {item.filhos ? (
                  recolhida ? (
                    <GrupoFlutuante item={item} pathname={pathname} badges={badges} badgeDe={badgeDe} />
                  ) : (
                    <Grupo
                      item={item}
                      pathname={pathname}
                      aberto={aberto === item.modulo}
                      onAlternar={() => setAberto((a) => (a === item.modulo ? null : item.modulo))}
                      onNavegar={onNavegar}
                      badges={badges}
                      badgeDe={badgeDe}
                    />
                  )
                ) : (
                  <LinkDireto item={item} pathname={pathname} recolhida={recolhida} onNavegar={onNavegar} badge={badgeDe(item.abas)} />
                )}
              </li>
            ))}
          </ul>
        </Fragment>
      ))}
    </nav>
  )
}

/** Módulo sem submenu (as outras telas dele são abas na própria página) */
function LinkDireto({ item, pathname, recolhida, onNavegar, badge }: { item: ItemMenu; pathname: string; recolhida: boolean; onNavegar?: () => void; badge?: number }) {
  const ativo = itemAtivoNaRota(item, pathname)
  const link = (
    <NavLink
      to={item.path ?? '/'}
      onClick={onNavegar}
      aria-current={ativo ? 'page' : undefined}
      className={cn(itemBase, ativo ? itemAtivo : itemInativo, recolhida && 'justify-center px-0 before:-left-3')}
    >
      <span className="relative">
        <IconeMenu icone={item.icone} estado={ativo ? 'ativo' : 'normal'} />
        {recolhida && Boolean(badge) && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-laranja ring-2 ring-card" />}
      </span>
      {!recolhida && (
        <>
          <span className="flex-1 truncate">{item.titulo}</span>
          <Contador valor={badge} />
        </>
      )}
    </NavLink>
  )
  if (!recolhida) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.titulo}</TooltipContent>
    </Tooltip>
  )
}

interface GrupoProps {
  item: ItemMenu
  pathname: string
  badges: Record<string, number | undefined>
  badgeDe: (telas?: NavLeaf[]) => number | undefined
}

/** Grupo com submenu: abre/fecha com animação; subitens numa linha-guia com a marca no ativo */
function Grupo({ item, pathname, aberto, onAlternar, onNavegar, badges, badgeDe }: GrupoProps & { aberto: boolean; onAlternar: () => void; onNavegar?: () => void }) {
  const ativo = itemAtivoNaRota(item, pathname)
  const filhos = item.filhos ?? []
  const idLista = `submenu-${item.modulo}`
  return (
    <>
      <button
        type="button"
        onClick={onAlternar}
        className={cn(itemBase, ativo ? 'text-tinta hover:bg-fundo' : itemInativo, aberto && !ativo && 'text-tinta')}
        aria-expanded={aberto}
        aria-controls={idLista}
      >
        <IconeMenu icone={item.icone} estado={ativo ? 'aberto' : 'normal'} />
        <span className="flex-1 truncate text-left">{item.titulo}</span>
        {!aberto && <Contador valor={badgeDe(filhos)} />}
        <ChevronRight className={cn('h-4 w-4 shrink-0 text-texto-secundario transition-transform duration-200', aberto && 'rotate-90')} />
      </button>
      {/* grid 0fr → 1fr anima a altura sem medir o conteúdo */}
      <div aria-hidden={!aberto} className={cn('grid transition-[grid-template-rows,opacity] duration-200 ease-out', aberto ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
        <div className="overflow-hidden">
          <ul id={idLista} className="relative ml-[23px] mt-0.5 flex flex-col gap-px border-l border-border py-1 pl-3">
            {filhos.map((f) => (
              <li key={f.path}>
                <NavLink
                  to={f.path}
                  end
                  onClick={onNavegar}
                  tabIndex={aberto ? undefined : -1}
                  className={({ isActive }) =>
                    cn(
                      'relative flex items-center justify-between gap-2 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors',
                      // marcador na linha-guia
                      'before:absolute before:-left-[13px] before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:transition-colors',
                      isActive
                        ? 'bg-marca-suave/70 font-semibold text-marca-escuro before:bg-marca'
                        : 'text-texto-secundario before:bg-transparent hover:bg-fundo hover:text-tinta hover:before:bg-border',
                    )
                  }
                >
                  <span className="truncate">{f.titulo}</span>
                  <Contador valor={badges[f.path]} />
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}

/** Sidebar recolhida: o submenu abre num painel flutuante ao lado do ícone */
function GrupoFlutuante({ item, pathname, badges, badgeDe }: GrupoProps) {
  const ativo = itemAtivoNaRota(item, pathname)
  const filhos = item.filhos ?? []
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(itemBase, 'justify-center px-0', ativo ? itemAtivo : itemInativo)} aria-label={item.titulo}>
        <span className="relative">
          <IconeMenu icone={item.icone} estado={ativo ? 'ativo' : 'normal'} />
          {Boolean(badgeDe(filhos)) && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-laranja ring-2 ring-card" />}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" sideOffset={10} className="min-w-56 rounded-xl p-1.5">
        <DropdownMenuLabel className="flex items-center gap-2 px-2 py-1.5 text-tinta">
          <item.icone className="h-4 w-4 text-marca-escuro" />
          {item.titulo}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {filhos.map((f) => {
          const atual = pathname === f.path
          return (
            <DropdownMenuItem key={f.path} asChild className={cn('rounded-lg', atual && 'bg-marca-suave/70 font-semibold text-marca-escuro')}>
              <NavLink to={f.path} end className="flex items-center justify-between gap-3">
                {f.titulo}
                <Contador valor={badges[f.path]} />
              </NavLink>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
