import { useNavigate } from 'react-router-dom'
import { ChevronDown, KeyRound, LogOut } from 'lucide-react'
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

export function UserMenu() {
  const { usuario, sair } = useAuth()
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
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl px-1.5 py-1 text-left text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-turquesa">
        <Avatar>
          {usuario?.avatar && <AvatarImage src={usuario.avatar} alt="" />}
          <AvatarFallback>{iniciais(nome)}</AvatarFallback>
        </Avatar>
        <span className="hidden flex-col leading-tight md:flex">
          <span className="text-sm font-medium">{nome}</span>
          <span className="text-xs text-white/80">{usuario?.papel.nome}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-white/60 md:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <p className="font-medium">{nome}</p>
          <p className="text-xs font-normal text-texto-secundario">{usuario?.email}</p>
          <p className="text-xs font-normal text-texto-secundario">{usuario?.papel.nome}</p>
        </DropdownMenuLabel>
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
