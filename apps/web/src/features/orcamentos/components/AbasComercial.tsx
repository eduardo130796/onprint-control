import { NavLink } from 'react-router-dom'
import { bandejaAbas, classeAba } from '@/lib/estilosAbas'

/** Abas "Solicitações | Orçamentos | Kanban" do módulo Orçamentos. */
export function AbasComercial() {
  const aba = ({ isActive }: { isActive: boolean }) => classeAba(isActive)
  return (
    <nav className={bandejaAbas} aria-label="Comercial">
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
