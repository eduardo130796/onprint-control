import { useEffect, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/features/auth/components/AuthProvider'

/** Ao voltar para a aba, atualiza a tela se os dados têm mais de 30 s (o tempo real cobre o resto sem bater na API à toa) */
const ATUALIZAR_AO_VOLTAR_MS = 30_000

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: (query) => Date.now() - query.state.dataUpdatedAt > ATUALIZAR_AO_VOLTAR_MS },
  },
})

/** Avisos flutuantes no mesmo modo da tela (acompanha a classe "dark" do <html>). */
function AvisosFlutuantes() {
  const [escuro, setEscuro] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const observador = new MutationObserver(() => setEscuro(document.documentElement.classList.contains('dark')))
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observador.disconnect()
  }, [])
  return <Toaster richColors position="top-right" closeButton theme={escuro ? 'dark' : 'light'} />
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider delayDuration={300}>
          {children}
          <AvisosFlutuantes />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
