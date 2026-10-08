import { Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { Loader2, LogOut } from 'lucide-react'
import { TelaCarregando } from '@/components/shared/TelaCarregando'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { plataformaApi, sessaoPlataforma } from '../api'

const LINKS = [
  { para: '/plataforma', rotulo: 'Painel', fim: true },
  { para: '/plataforma/empresas', rotulo: 'Empresas' },
  { para: '/plataforma/planos', rotulo: 'Planos' },
  { para: '/plataforma/avisos', rotulo: 'Avisos do Asaas' },
]

/** Moldura do painel da plataforma: exige a sessão de administrador da plataforma. */
export function PlataformaLayout() {
  const navigate = useNavigate()
  const temToken = Boolean(sessaoPlataforma.token())
  const eu = useQuery({ queryKey: ['plataforma', 'eu'], queryFn: plataformaApi.eu, enabled: temToken, retry: false })

  if (!temToken) return <Navigate to="/plataforma/login" replace />
  if (eu.isPending) return <TelaCarregando />
  if (eu.isError) return <Navigate to="/plataforma/login" replace />

  function sair() {
    sessaoPlataforma.definir(null)
    navigate('/plataforma/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-fundo">
      <header className="bg-grafite text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <p className="font-titulo text-lg font-extrabold">
            ONPrint <span className="text-marca">Plataforma</span>
          </p>
          <nav aria-label="Painel da plataforma" className="flex flex-wrap gap-1">
            {LINKS.map((l) => (
              <NavLink
                key={l.para}
                to={l.para}
                end={l.fim}
                className={({ isActive }) => cn('rounded-lg px-3 py-1.5 text-sm font-semibold', isActive ? 'bg-marca text-grafite' : 'text-white/80 hover:bg-white/10 hover:text-white')}
              >
                {l.rotulo}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-white/80">{eu.data.nome}</span>
            <Button size="sm" variant="secondary" onClick={sair}>
              <LogOut /> Sair
            </Button>
          </div>
        </div>
        <div className="h-1 bg-marca" aria-hidden="true">
          <span className="block h-1 w-14 bg-laranja" />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Suspense
          fallback={
            <div className="flex justify-center py-24" role="status" aria-label="Carregando">
              <Loader2 className="h-6 w-6 animate-spin text-marca-escuro" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
