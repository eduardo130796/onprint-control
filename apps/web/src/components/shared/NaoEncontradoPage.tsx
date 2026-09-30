import { Link } from 'react-router-dom'
import { SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from './EmptyState'

export function NaoEncontradoPage() {
  return (
    <Card>
      <EmptyState
        icone={SearchX}
        titulo="Página não encontrada"
        descricao="O endereço acessado não existe ou foi movido."
        acao={
          <Button asChild>
            <Link to="/">Ir para o Dashboard</Link>
          </Button>
        }
      />
    </Card>
  )
}
