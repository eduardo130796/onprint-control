import { Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { BellRing, Building2, Gauge, Layers, Loader2, LogOut, ShieldCheck, TicketPercent } from 'lucide-react'
import { iniciais } from '@onprint/shared'
import { TelaCarregando } from '@/components/shared/TelaCarregando'
import { AvisoInatividade } from '@/features/auth/AvisoInatividade'
import { useInatividade } from '@/features/auth/useInatividade'
import { cn } from '@/lib/utils'
import { plataformaApi, sessaoPlataforma } from '../api'

const LINKS = [
  { para: '/plataforma', rotulo: 'Painel', Icone: Gauge, fim: true },
  { para: '/plataforma/empresas', rotulo: 'Assinaturas', Icone: Building2 },
  { para: '/plataforma/cupons', rotulo: 'Cupons', Icone: TicketPercent },
  { para: '/plataforma/planos', rotulo: 'Planos', Icone: Layers },
  { para: '/plataforma/avisos', rotulo: 'Avisos do Asaas', Icone: BellRing },
]

/** Moldura do painel da plataforma: exige a sessão de administrador da plataforma. */
export function PlataformaLayout() {
  const navigate = useNavigate()
  const temToken = Boolean(sessaoPlataforma.token())
  const eu = useQuery({ queryKey: ['plataforma', 'eu'], queryFn: plataformaApi.eu, enabled: temToken, retry: false })
  // Painel controla todas as empresas: sai sozinho após 30 min sem uso
  const sairPorInatividade = () => {
    sessaoPlataforma.definir(null)
    navigate('/plataforma/login', { replace: true })
  }
  const inatividade = useInatividade({ limiteMin: 30, ativo: temToken, aoExpirar: sairPorInatividade })

  if (!temToken) return <Navigate to="/plataforma/login" replace />
  if (eu.isPending) return <TelaCarregando />
  if (eu.isError) return <Navigate to="/plataforma/login" replace />

  function sair() {
    sessaoPlataforma.definir(null)
    navigate('/plataforma/login', { replace: true })
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-fundo">
      <header className="relative bg-grafite text-white">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -right-24 -top-40 h-72 w-72 rounded-full bg-marca/20 blur-3xl" />
        </div>
        <div className="relative mx-auto flex max-w-[87.5rem] items-center gap-3 px-4 pt-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-marca text-grafite-escuro">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="leading-tight">
              <p className="font-titulo text-base font-extrabold">ONPrint Control</p>
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-marca">Plataforma</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-right text-xs leading-tight sm:block">
              <span className="block font-semibold text-white">{eu.data.nome}</span>
              <span className="block text-white/50">{eu.data.email}</span>
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-bold ring-1 ring-white/15" aria-hidden="true">
              {iniciais(eu.data.nome)}
            </span>
            <button type="button" onClick={sair} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white" aria-label="Sair do painel">
              <LogOut className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
        {/* Navegação: rola de lado no celular (sem quebrar a página) */}
        <nav aria-label="Painel da plataforma" className="relative mx-auto max-w-[87.5rem] px-4 sm:px-6">
          <ul className="-mb-px flex gap-1 overflow-x-auto pt-3 [scrollbar-width:none]">
            {LINKS.map((l) => (
              <li key={l.para} className="shrink-0">
                <NavLink
                  to={l.para}
                  end={l.fim}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-t-xl border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors',
                      isActive ? 'border-marca bg-white/[0.07] text-white' : 'border-transparent text-white/65 hover:bg-white/5 hover:text-white',
                    )
                  }
                >
                  <l.Icone className="h-4 w-4" aria-hidden="true" />
                  {l.rotulo}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex h-1" aria-hidden="true">
          <span className="w-16 bg-laranja" />
          <span className="flex-1 bg-marca" />
        </div>
      </header>
      <main className="mx-auto max-w-[87.5rem] px-4 py-6 sm:px-6 sm:py-8">
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
      <AvisoInatividade restanteMs={inatividade.restanteMs} onContinuar={inatividade.continuar} onSair={sairPorInatividade} />
    </div>
  )
}
