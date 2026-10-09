import { useNavigate } from 'react-router-dom'
import { Check, ChevronDown, KeyRound, LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { iniciais } from '@onprint/shared'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/hooks/useAuth'

const MODOS = [
  { modo: 'claro', rotulo: 'Claro', Icone: Sun },
  { modo: 'escuro', rotulo: 'Escuro', Icone: Moon },
  { modo: 'sistema', rotulo: 'Igual ao sistema', Icone: Monitor },
] as const

export function UserMenu() {
  const { usuario, sair, definirModoTela } = useAuth()
  const navigate = useNavigate()
  const nome = usuario?.nome ?? 'Usuário'

  async function onSair() {
    try {
      await sair()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl px-1.5 py-1 text-left text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca">
        <Avatar>
          {usuario?.avatar && <AvatarImage src={usuario.avatar} alt="" />}
          <AvatarFallback>{iniciais(nome)}</AvatarFallback>
        </Avatar>
        <span className="hidden flex-col leading-tight md:flex">
          <span className="text-sm font-semibold">{nome}</span>
          <span className="text-xs text-white/80">{usuario?.papel.nome}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-white/80 md:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <p className="font-medium">{nome}</p>
          <p className="text-xs font-normal text-texto-secundario">{usuario?.email}</p>
          <p className="text-xs font-normal text-texto-secundario">{usuario?.papel.nome}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">Aparência</DropdownMenuLabel>
        {MODOS.map(({ modo, rotulo, Icone }) => (
          <DropdownMenuItem
            key={modo}
            onSelect={(e) => {
              e.preventDefault()
              definirModoTela(modo).catch((erro: Error) => toast.error(erro.message))
            }}
          >
            <Icone /> {rotulo}
            {usuario?.modoTela === modo && <Check className="ml-auto text-marca-escuro" aria-label="selecionado" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/trocar-senha')}>
          <KeyRound /> Alterar senha
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void onSair()} className="text-coral-escuro focus:text-coral-escuro">
          <LogOut /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
