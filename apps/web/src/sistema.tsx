import { RouterProvider } from 'react-router-dom'
import { AppProviders } from '@/app/providers/AppProviders'
import { router } from '@/app/router'

/** O sistema (área logada e páginas públicas de aprovação), carregado pelo main.tsx fora do endereço de vitrine. */
export function SistemaApp() {
  return (
    <AppProviders>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </AppProviders>
  )
}
