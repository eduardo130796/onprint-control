import { Navigate } from 'react-router-dom'
import { primeiraPaginaPermitida } from '@/app/navigation'
import { ExigePermissao } from '@/features/auth/components/ExigePermissao'
import { usePermissoes } from '@/hooks/usePermission'
import { DashboardPage } from './DashboardPage'

/** Página inicial: quem não pode ver o Dashboard (ex.: caixa) cai na primeira tela permitida. */
export function InicioPage() {
  const pode = usePermissoes()
  if (pode('dashboard')) return <DashboardPage />
  const destino = primeiraPaginaPermitida((m, a) => pode(m, a))
  return destino ? <Navigate to={destino} replace /> : <ExigePermissao modulo="dashboard">{null}</ExigePermissao>
}
