import { NavLink } from 'react-router-dom'
import { bandejaAbas, classeAba } from '@/lib/estilosAbas'

interface AbasNavegacaoProps {
  rotulo: string
  abas: { para: string; titulo: string; fim?: boolean }[]
}

/** Abas de navegação entre telas irmãs (ex.: Lista | Kanban | Entregas). */
export function AbasNavegacao({ rotulo, abas }: AbasNavegacaoProps) {
  const estilo = ({ isActive }: { isActive: boolean }) => classeAba(isActive)
  return (
    <nav className={bandejaAbas} aria-label={rotulo}>
      {abas.map((a) => (
        <NavLink key={a.para} to={a.para} end={a.fim} className={estilo}>
          {a.titulo}
        </NavLink>
      ))}
    </nav>
  )
}
