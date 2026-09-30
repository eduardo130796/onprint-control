import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ShieldX } from 'lucide-react'
import type { Acao, Modulo } from '@onprint/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/EmptyState'
import { usePermission } from '@/hooks/usePermission'

interface ExigePermissaoProps {
  modulo: Modulo
  acao?: Acao
  children: ReactNode
}

/** Protege uma tela no front (a API também devolve 403 se alguém chamar direto). */
export function ExigePermissao({ modulo, acao = 'visualizar', children }: ExigePermissaoProps) {
  if (usePermission(modulo, acao)) return <>{children}</>
  return (
    <Card>
      <EmptyState
        icone={ShieldX}
        titulo="Acesso não permitido"
        descricao="Seu perfil não tem permissão para acessar esta tela. Fale com o administrador se precisar."
        acao={
          <Button asChild variant="outline">
            <Link to="/">Voltar ao início</Link>
          </Button>
        }
      />
    </Card>
  )
}
