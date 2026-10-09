import { useEffect, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/features/auth/components/AuthProvider'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
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
