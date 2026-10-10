import { StrictMode, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { dominioBaseVitrine, pareceDominioProprio, slugDaVitrine } from '@/features/vitrine-site/host'
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
const abrirVitrine = (slug: string) => void import('@/features/vitrine-site/VitrineApp').then(({ VitrineApp }) => montar(() => <VitrineApp slug={slug} />))
const abrirSistema = () => void import('./sistema').then(({ SistemaApp }) => montar(SistemaApp))

const host = window.location.host
const base = dominioBaseVitrine(import.meta.env.VITE_DOMINIO_VITRINE)
const slug = slugDaVitrine(host, base)
if (slug) {
  abrirVitrine(slug)
} else if (pareceDominioProprio(host, base)) {
  // Domínio próprio da gráfica (www.suagrafica.com.br → CNAME para o subdomínio dela): a API diz de qual vitrine é
  fetch(`/api/v1/publico/vitrine-dominio?host=${encodeURIComponent(host)}`)
    .then((r) => (r.ok ? (r.json() as Promise<{ slug?: string }>) : null))
    .then((d) => (d?.slug ? abrirVitrine(d.slug) : abrirSistema()))
    .catch(abrirSistema)
} else {
  abrirSistema()
}
