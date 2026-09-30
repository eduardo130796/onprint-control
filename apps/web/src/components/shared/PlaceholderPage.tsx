import { useLocation } from 'react-router-dom'
import { Construction } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/layout/PageHeader'
import { paginaAtual } from '@/app/navigation'
import { EmptyState } from './EmptyState'

/** Tela provisória das rotas que ainda serão implementadas nas próximas fases. */
export function PlaceholderPage() {
  const { pathname } = useLocation()
  const pagina = paginaAtual(pathname)
  const ehNovo = pagina && pathname !== pagina.path
  const titulo = ehNovo ? (pagina.novo ?? 'Novo registro') : (pagina?.titulo ?? 'Página')

  return (
    <>
      <PageHeader
        titulo={titulo}
        subtitulo={pagina && pagina.moduloTitulo !== pagina.titulo ? pagina.moduloTitulo : undefined}
      />
      <Card>
        <EmptyState
          icone={pagina?.icone ?? Construction}
          titulo="Em construção"
          descricao={
            pagina
              ? `Esta tela será implementada na Fase ${pagina.fase} do roadmap.`
              : 'Esta tela será implementada nas próximas fases.'
          }
        />
      </Card>
    </>
  )
}
