import { useNavigate } from 'react-router-dom'
import { ChevronDown, CreditCard, KeyRound, LogOut, Monitor, Moon, Search, Sun, Type } from 'lucide-react'
import { toast } from 'sonner'
import { iniciais } from '@onprint/shared'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { TOM_ASSINATURA, statusDaAssinatura } from '@/features/assinatura/status'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

const MODOS = [
  { modo: 'claro', rotulo: 'Claro', Icone: Sun },
  { modo: 'escuro', rotulo: 'Escuro', Icone: Moon },
  { modo: 'sistema', rotulo: 'Sistema', Icone: Monitor },
] as const

/** Conta do usuário: avatar no topo; no menu, quem é, o plano, o modo da tela, preferências e sair. */
export function UserMenu() {
  const { usuario, sair, definirModoTela } = useAuth()
  const navigate = useNavigate()
  const nome = usuario?.nome ?? 'Usuário'
  const a = usuario?.assinatura
  const status = a ? statusDaAssinatura(a) : null

  async function onSair() {
    try {
      await sair()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const avatar = (tamanho: string) => (
    <Avatar className={tamanho}>
      {usuario?.avatar && <AvatarImage src={usuario.avatar} alt="" />}
      <AvatarFallback className="bg-marca font-semibold text-marca-contraste">{iniciais(nome)}</AvatarFallback>
    </Avatar>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="group flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-1.5 text-left text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 data-[state=open]:bg-white/10"
        aria-label={`Conta de ${nome}`}
      >
        {avatar('h-8 w-8 ring-2 ring-white/15')}
        <span className="hidden max-w-[10rem] flex-col leading-tight xl:flex">
          <span className="truncate text-[0.8125rem] font-semibold">{nome.split(' ')[0]}</span>
          <span className="truncate text-[0.6875rem] text-white/55">{usuario?.papel.nome}</span>
        </span>
        <ChevronDown className="hidden h-3.5 w-3.5 text-white/50 transition-transform group-data-[state=open]:rotate-180 sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-72 rounded-2xl p-1.5">
        {/* Quem está conectado */}
        <div className="flex items-center gap-3 px-2.5 pb-3 pt-2.5">
          {avatar('h-10 w-10')}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-tinta">{nome}</p>
            <p className="truncate text-xs text-texto-secundario">{usuario?.email}</p>
            <span className="mt-1 inline-flex rounded-full bg-fundo px-2 py-0.5 text-[0.65625rem] font-semibold text-texto-secundario">{usuario?.papel.nome}</span>
          </div>
        </div>

        {/* Plano da empresa */}
        {a && status && (
          <DropdownMenuItem onSelect={() => navigate('/assinatura')} className="mx-0.5 mb-1 rounded-xl border border-border px-2.5 py-2">
            <CreditCard className="text-texto-secundario" />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.8125rem] font-medium text-tinta">Plano {a.plano}</span>
              <span className="flex items-center gap-1.5 text-[0.6875rem] text-texto-secundario">
                <span className={cn('h-1.5 w-1.5 rounded-full', TOM_ASSINATURA[status.tom].pontoClaro)} />
                {status.rotulo}
              </span>
            </span>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        {/* Modo da tela em uma linha (controle segmentado) */}
        <div className="px-2.5 py-2">
          <p className="mb-1.5 text-[0.6875rem] font-medium text-texto-secundario">Modo da tela</p>
          <div role="radiogroup" aria-label="Modo da tela" className="grid grid-cols-3 gap-1 rounded-xl bg-fundo p-1">
            {MODOS.map(({ modo, rotulo, Icone }) => {
              const marcado = usuario?.modoTela === modo
              return (
                <button
                  key={modo}
                  type="button"
                  role="radio"
                  aria-checked={marcado}
                  onClick={() => definirModoTela(modo).catch((erro: Error) => toast.error(erro.message))}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    marcado ? 'bg-card text-tinta shadow-sm' : 'text-texto-secundario hover:text-tinta',
                  )}
                >
                  <Icone className="h-3.5 w-3.5" /> {rotulo}
                </button>
              )
            })}
          </div>
        </div>
        <DropdownMenuItem onSelect={() => navigate('/configuracoes/aparencia')}>
          <Type /> Fonte e intensidade do texto
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/trocar-senha')}>
          <KeyRound /> Alterar senha
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}>
          <Search /> Localizar
          <kbd className="ml-auto rounded border border-border px-1 text-[0.625rem] font-semibold text-texto-secundario">Ctrl K</kbd>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void onSair()} className="text-coral-escuro focus:text-coral-escuro">
          <LogOut /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
