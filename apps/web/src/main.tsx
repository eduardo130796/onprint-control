import { StrictMode, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { dominioBaseVitrine, slugDaVitrine } from '@/features/vitrine-site/host'
// Fontes empacotadas com o sistema (funciona sem internet), variáveis para os pesos leve/normal/forte:
// Inter no texto (ou a fonte escolhida pelo usuário em Aparência), Manrope nos títulos. Só baixa a que estiver em uso.
import '@fontsource-variable/inter'
import '@fontsource-variable/manrope'
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/lexend'
import '@fontsource-variable/nunito-sans'
import './index.css'

const raiz = createRoot(document.getElementById('root')!)
const montar = (App: ComponentType) =>
  raiz.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

// O mesmo build serve o sistema e a vitrine de cada gráfica ({slug}.{domínio}, ver docs/VITRINE.md): cada um no
// seu pacote, carregado sob demanda, para um não pesar no outro (e só um roteador escutar o endereço)
const slug = slugDaVitrine(window.location.host, dominioBaseVitrine(import.meta.env.VITE_DOMINIO_VITRINE))
if (slug) {
  void import('@/features/vitrine-site/VitrineApp').then(({ VitrineApp }) => montar(() => <VitrineApp slug={slug} />))
} else {
  void import('./sistema').then(({ SistemaApp }) => montar(SistemaApp))
}
