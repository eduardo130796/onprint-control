import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react'
import { areaDaRota, linhaAtiva, montarAreas, type AreaMenu, type AreaVisivel, type LinhaMenu } from '@/app/navigation'
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
  /** Só o trilho de áreas (o painel abre num menu flutuante ao clicar) */
  recolhida?: boolean
  onAlternar?: () => void
  onNavegar?: () => void
  /** Rodapé do painel (assinatura discreta do sistema) */
  rodape?: ReactNode
}

type Badges = Record<string, number | undefined>

const contagem = (linhas: LinhaMenu[], badges: Badges) => linhas.reduce((s, l) => s + l.chaves.reduce((t, c) => t + (badges[c] ?? 0), 0), 0)
const linhasDe = (a: AreaVisivel) => a.blocos.flatMap((b) => b.linhas)

/**
 * Menu focado por área: trilho escuro com as áreas (Comercial, Produção, Financeiro…) e um painel
 * que mostra só as telas e os atalhos da área escolhida. Ao navegar, o painel volta para a área da tela atual.
 */
export function SidebarNav({ recolhida = false, onAlternar, onNavegar, rodape }: SidebarNavProps) {
  const { pathname } = useLocation()
  const pode = usePermissoes()
  const areas = useMemo(() => montarAreas((m, a) => pode(m, a)), [pode])
  const alertasEstoque = useContagemAlertas()
  const reajuste = useContagemReajuste()
  const badges: Badges = { '/estoque/alertas': alertasEstoque.data, '/produtos/reajuste': reajuste.data }

  const daRota = areaDaRota(pathname)
  const [escolhida, setEscolhida] = useState<AreaMenu | null>(null)
  useEffect(() => setEscolhida(null), [pathname])
  const atual = areas.find((a) => a.area === (escolhida ?? daRota)) ?? areas[0]
  if (!atual) return null

  const principais = areas.filter((a) => a.area !== 'configuracoes')
  const ajustes = areas.find((a) => a.area === 'configuracoes')

  const botaoArea = (a: AreaVisivel) =>
    recolhida ? (
      <AreaFlutuante key={a.area} area={a} ativa={a.area === daRota} pathname={pathname} badges={badges} />
    ) : (
      <BotaoArea key={a.area} area={a} ativa={a.area === atual.area} daRota={a.area === daRota} badge={contagem(linhasDe(a), badges)} onEscolher={() => setEscolhida(a.area)} />
    )

  return (
    <div className="flex h-full min-h-0">
      {/* Trilho de áreas */}
      <nav className="flex w-[76px] shrink-0 flex-col items-center gap-1 bg-grafite py-3" aria-label="Áreas do sistema">
        {principais.map(botaoArea)}
        <div className="mt-auto flex w-full flex-col items-center gap-1 pt-3">
          {ajustes && botaoArea(ajustes)}
          {onAlternar && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onAlternar}
                  className="mt-1 flex h-9 w-9 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
                >
                  {recolhida ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{recolhida ? 'Expandir menu' : 'Recolher menu'}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </nav>

      {!recolhida && <PainelArea area={atual} pathname={pathname} badges={badges} onNavegar={onNavegar} rodape={rodape} />}
    </div>
  )
}

/** Área no trilho: ícone com o nome curto embaixo; a ativa ganha fundo claro e o traço laranja da marca */
function BotaoArea({ area, ativa, daRota, badge, onEscolher }: { area: AreaVisivel; ativa: boolean; daRota: boolean; badge: number; onEscolher: () => void }) {
  const navigate = useNavigate()
  const linhas = linhasDe(area)
  // Área com uma tela só (Início): o clique já abre a tela
  const escolher = () => {
    onEscolher()
    if (linhas.length === 1 && linhas[0]) navigate(linhas[0].path)
  }
  return (
    <button
      type="button"
      onClick={escolher}
      aria-pressed={ativa}
      aria-label={area.titulo}
      className={cn(
        'group relative flex w-[64px] flex-col items-center gap-1 rounded-xl py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
        ativa ? 'text-white' : 'text-white/55 hover:text-white',
      )}
    >
      {daRota && <span className="absolute -left-1.5 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-laranja" aria-hidden />}
      <span
        className={cn(
          'relative flex h-9 w-11 items-center justify-center rounded-xl transition-all duration-150',
          ativa ? 'bg-white/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]' : 'group-hover:bg-white/[0.07]',
        )}
      >
        <area.icone className="h-[19px] w-[19px]" strokeWidth={ativa ? 2.2 : 1.9} />
        {badge > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-laranja ring-2 ring-grafite" aria-label={`${badge} pendente(s)`} />}
      </span>
      <span className={cn('max-w-full truncate px-0.5 text-[10.5px] leading-none tracking-wide', ativa ? 'font-semibold' : 'font-medium')}>{area.rotulo}</span>
    </button>
  )
}

/** Painel da área: título, telas (em blocos quando há mais de um grupo) e atalhos "Novo…" */
function PainelArea({ area, pathname, badges, onNavegar, rodape }: { area: AreaVisivel; pathname: string; badges: Badges; onNavegar?: () => void; rodape?: ReactNode }) {
  const ativa = linhaAtiva(linhasDe(area), pathname)
  return (
    <div className="flex min-w-0 flex-1 flex-col border-r border-border bg-card">
      <div key={area.area} className="flex-1 overflow-y-auto px-3 pb-4 animate-in fade-in-0 slide-in-from-left-1 duration-200">
        <div className="px-2.5 pb-3 pt-5">
          <h2 className="text-[15px] font-semibold tracking-tight text-tinta">{area.titulo}</h2>
          <p className="mt-0.5 text-xs text-texto-secundario">{area.descricao}</p>
        </div>

        <nav aria-label={area.titulo} className="flex flex-col gap-3">
          {area.blocos.map((bloco, i) => (
            <div key={bloco.titulo ?? i}>
              {bloco.titulo && <p className="px-2.5 pb-1 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-texto-secundario/80">{bloco.titulo}</p>}
              <ul className="flex flex-col gap-px">
                {bloco.linhas.map((l) => {
                  const marcada = l === ativa
                  const badge = contagem([l], badges)
                  return (
                    <li key={l.path}>
                      <Link
                        to={l.path}
                        onClick={onNavegar}
                        aria-current={marcada ? 'page' : undefined}
                        className={cn(
                          'flex h-9 items-center justify-between gap-2 rounded-lg px-2.5 text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          marcada ? 'bg-marca-suave font-semibold text-marca-escuro' : 'font-medium text-tinta/70 hover:bg-fundo hover:text-tinta',
                        )}
                      >
                        <span className="truncate">{l.titulo}</span>
                        {badge > 0 && (
                          <span className="min-w-5 rounded-full bg-laranja-escuro px-1.5 text-center text-[11px] font-bold leading-5 text-white tabular-nums" aria-label={`${badge} pendente(s)`}>
                            {badge > 99 ? '99+' : badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        {area.acoes.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-texto-secundario/80">Atalhos</p>
            <ul className="flex flex-col gap-px">
              {area.acoes.slice(0, 4).map((a) => (
                <li key={a.path}>
                  <Link
                    to={a.path}
                    onClick={onNavegar}
                    className="group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-texto-secundario transition-colors hover:bg-fundo hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-md border border-border text-texto-secundario transition-colors group-hover:border-marca group-hover:bg-marca group-hover:text-marca-contraste">
                      <Plus className="h-3 w-3" strokeWidth={2.5} />
                    </span>
                    {a.titulo}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {rodape && <div className="flex justify-end px-4 py-2.5">{rodape}</div>}
    </div>
  )
}

/** Menu recolhido: a área abre as telas num painel flutuante ao lado do trilho */
function AreaFlutuante({ area, ativa, pathname, badges }: { area: AreaVisivel; ativa: boolean; pathname: string; badges: Badges }) {
  const marcada = linhaAtiva(linhasDe(area), pathname)
  const badge = contagem(linhasDe(area), badges)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={area.titulo}
        className={cn(
          'group relative flex w-[64px] flex-col items-center gap-1 rounded-xl py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
          ativa ? 'text-white' : 'text-white/55 hover:text-white data-[state=open]:text-white',
        )}
      >
        {ativa && <span className="absolute -left-1.5 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-laranja" aria-hidden />}
        <span className={cn('relative flex h-9 w-11 items-center justify-center rounded-xl transition-colors', ativa ? 'bg-white/[0.14]' : 'group-hover:bg-white/[0.07] group-data-[state=open]:bg-white/[0.07]')}>
          <area.icone className="h-[19px] w-[19px]" />
          {badge > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-laranja ring-2 ring-grafite" />}
        </span>
        <span className="max-w-full truncate px-0.5 text-[10.5px] font-medium leading-none tracking-wide">{area.rotulo}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" sideOffset={8} className="min-w-56 rounded-xl p-1.5">
        <DropdownMenuLabel className="px-2 py-1.5">
          <span className="block text-sm font-semibold text-tinta">{area.titulo}</span>
          <span className="block text-xs font-normal text-texto-secundario">{area.descricao}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {area.blocos.map((bloco, i) => (
          <div key={bloco.titulo ?? i}>
            {bloco.titulo && <p className="px-2 pb-0.5 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-texto-secundario/80">{bloco.titulo}</p>}
            {bloco.linhas.map((l) => (
              <DropdownMenuItem key={l.path} asChild className={cn('rounded-lg', l === marcada && 'bg-marca-suave font-semibold text-marca-escuro')}>
                <NavLink to={l.path} end className="flex items-center justify-between gap-3">
                  {l.titulo}
                  {contagem([l], badges) > 0 && <span className="rounded-full bg-laranja-escuro px-1.5 text-[11px] font-bold leading-5 text-white">{contagem([l], badges)}</span>}
                </NavLink>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
