import { Suspense, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useTempoReal } from '@/hooks/useTempoReal'
import { cn } from '@/lib/utils'
import { BannerAssinatura } from './BannerAssinatura'
import { FloatingActionButton } from './FloatingActionButton'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

const CHAVE_RECOLHIDA = 'onprint:sidebar-recolhida'

/** Telas que usam a largura toda (quadros kanban); as demais ficam centralizadas em até 1280 px. */
const TELAS_LARGAS = ['/producao', '/pedidos/kanban', '/orcamentos/kanban']

function lerRecolhida() {
  try {
    return localStorage.getItem(CHAVE_RECOLHIDA) === '1'
  } catch {
    return false
  }
}

export function AppLayout() {
  const [recolhida, setRecolhida] = useState(lerRecolhida)
  const [mobileAberta, setMobileAberta] = useState(false)
  const { usuario } = useAuth()
  const { pathname } = useLocation()
  const larga = TELAS_LARGAS.includes(pathname)
  useTempoReal(Boolean(usuario) && !usuario?.deveTrocarSenha)

  function alternar() {
    setRecolhida((r) => {
      try {
        localStorage.setItem(CHAVE_RECOLHIDA, r ? '0' : '1')
      } catch {
        // preferência apenas visual; ignora falha de armazenamento
      }
      return !r
    })
  }

  return (
    <div className="min-h-screen bg-fundo">
      <Topbar onAbrirMenuMobile={() => setMobileAberta(true)} />
      <Sidebar
        recolhida={recolhida}
        onAlternar={alternar}
        mobileAberta={mobileAberta}
        onMobileAbertaChange={setMobileAberta}
      />
      <main
        className={cn(
          'px-4 pb-24 pt-20 transition-[padding] duration-200 sm:px-6 lg:pt-24',
          recolhida ? 'lg:pl-[104px]' : 'lg:pl-[288px]',
        )}
      >
        <div className={larga ? 'w-full' : 'mx-auto max-w-7xl'}>
          <BannerAssinatura />
          {/* As telas são carregadas sob demanda (app/paginas.ts) */}
          <Suspense
            fallback={
              <div className="flex justify-center py-24" role="status" aria-label="Carregando">
                <Loader2 className="h-6 w-6 animate-spin text-marca-escuro" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </main>
      <FloatingActionButton />
    </div>
  )
}
