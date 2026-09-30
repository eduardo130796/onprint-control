import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface AbasNavegacaoProps {
  rotulo: string
  abas: { para: string; titulo: string; fim?: boolean }[]
}

/** Abas de navegação entre telas irmãs (ex.: Lista | Kanban | Entregas). */
export function AbasNavegacao({ rotulo, abas }: AbasNavegacaoProps) {
  const estilo = ({ isActive }: { isActive: boolean }) =>
    cn(
      '-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
      isActive ? 'border-turquesa text-petroleo' : 'border-transparent text-texto-secundario hover:text-petroleo',
    )
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border" aria-label={rotulo}>
      {abas.map((a) => (
        <NavLink key={a.para} to={a.para} end={a.fim} className={estilo}>
          {a.titulo}
        </NavLink>
      ))}
    </nav>
  )
}
