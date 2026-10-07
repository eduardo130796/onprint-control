import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

/** Abas "Solicitações | Orçamentos | Kanban" do módulo Orçamentos. */
export function AbasComercial() {
  const aba = ({ isActive }: { isActive: boolean }) =>
    cn(
      '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
      isActive ? 'border-turquesa text-petroleo' : 'border-transparent text-texto-secundario hover:text-petroleo',
    )
  return (
    <nav className="mb-6 flex gap-1 border-b border-border" aria-label="Comercial">
      <NavLink to="/orcamentos/solicitacoes" className={aba}>
        Solicitações
      </NavLink>
      <NavLink to="/orcamentos" end className={aba}>
        Orçamentos
      </NavLink>
      <NavLink to="/orcamentos/kanban" className={aba}>
        Kanban
      </NavLink>
    </nav>
  )
}
