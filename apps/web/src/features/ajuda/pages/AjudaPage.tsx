import { Link, useParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { ListaAjuda, PaginaTutorial } from '../components/CentralAjuda'

/** Central de ajuda dentro do sistema (/ajuda) */
export function AjudaPage() {
  return (
    <>
      <PageHeader titulo="Central de ajuda" subtitulo="Passo a passo e vídeos curtos de cada tarefa. Escolha o que você quer fazer." />
      <ListaAjuda />
    </>
  )
}

/** Um tutorial dentro do sistema (/ajuda/:slug), com atalho para a tela de verdade */
export function TutorialAjudaPage() {
  const { slug } = useParams()
  return (
    <PaginaTutorial
      slug={slug}
      acaoNoSistema={(t) =>
        t.telas[0] ? (
          <Button asChild>
            <Link to={t.telas[0]}>
              Abrir a tela e fazer agora <ArrowRight />
            </Link>
          </Button>
        ) : null
      }
    />
  )
}
