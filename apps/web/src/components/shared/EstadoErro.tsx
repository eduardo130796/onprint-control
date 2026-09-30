import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from './EmptyState'

interface EstadoErroProps {
  erro: unknown
  onTentarNovamente?: () => void
}

export function EstadoErro({ erro, onTentarNovamente }: EstadoErroProps) {
  return (
    <EmptyState
      icone={AlertTriangle}
      titulo="Não foi possível carregar"
      descricao={erro instanceof Error ? erro.message : 'Erro inesperado.'}
      acao={
        onTentarNovamente && (
          <Button variant="outline" onClick={onTentarNovamente}>
            <RotateCw /> Tentar novamente
          </Button>
        )
      }
    />
  )
}
