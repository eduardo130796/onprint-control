import { Suspense, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useTempoReal } from '@/hooks/useTempoReal'
import { cn } from '@/lib/utils'
import { FloatingActionButton } from './FloatingActionButton'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

const CHAVE_RECOLHIDA = 'onprint:sidebar-recolhida'

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
        <div className="mx-auto max-w-7xl">
          {/* As telas são carregadas sob demanda (app/paginas.ts) */}
          <Suspense
            fallback={
              <div className="flex justify-center py-24" role="status" aria-label="Carregando">
                <Loader2 className="h-6 w-6 animate-spin text-turquesa-escuro" />
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
