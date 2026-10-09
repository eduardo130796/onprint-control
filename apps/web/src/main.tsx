import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { AppProviders } from '@/app/providers/AppProviders'
import { router } from '@/app/router'
// Fontes empacotadas com o sistema (funciona sem internet), variáveis para os pesos leve/normal/forte:
// Inter no texto (ou a fonte escolhida pelo usuário em Aparência), Manrope nos títulos. Só baixa a que estiver em uso.
import '@fontsource-variable/inter'
import '@fontsource-variable/manrope'
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/lexend'
import '@fontsource-variable/nunito-sans'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </AppProviders>
  </StrictMode>,
)
