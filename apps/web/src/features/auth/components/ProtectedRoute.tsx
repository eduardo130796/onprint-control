import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { TelaCarregando } from '@/components/shared/TelaCarregando'
import { useAuth } from '@/hooks/useAuth'

/**
 * Exige login e, se a troca de senha for obrigatória, leva à tela de troca.
 * Apenas conveniência de navegação: quem garante o acesso é a API.
 */
export function ProtectedRoute() {
  const { usuario, carregando } = useAuth()
  const location = useLocation()

  if (carregando) return <TelaCarregando />
  if (!usuario) return <Navigate to="/login" replace state={{ de: location.pathname }} />
  if (usuario.deveTrocarSenha && location.pathname !== '/trocar-senha') {
    return <Navigate to="/trocar-senha" replace />
  }
  // Assinatura bloqueada: só a tela da assinatura (onde se regulariza)
  if (usuario.assinatura?.nivel === 'bloqueado' && location.pathname !== '/assinatura' && location.pathname !== '/trocar-senha') {
    return <Navigate to="/assinatura" replace />
  }

  return <Outlet />
}
