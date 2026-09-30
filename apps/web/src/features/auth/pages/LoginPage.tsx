import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { TelaCarregando } from '@/components/shared/TelaCarregando'
import { useAuth } from '@/hooks/useAuth'
import { AuthLayout } from '../components/AuthLayout'
import { loginSchema, type LoginInput } from '../schemas'

export function LoginPage() {
  const { usuario, carregando, entrar } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const destino = (location.state as { de?: string } | null)?.de ?? '/'

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', senha: '' },
  })
  const { errors, isSubmitting } = form.formState

  if (carregando) return <TelaCarregando />
  if (usuario) return <Navigate to={destino} replace />

  async function onSubmit(valores: LoginInput) {
    try {
      const logado = await entrar(valores)
      navigate(logado.deveTrocarSenha ? '/trocar-senha' : destino, { replace: true })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <AuthLayout titulo="Entrar" descricao="Acesse com seu e-mail e senha.">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <CampoFormulario id="email" rotulo="E-mail" erro={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="voce@empresa.com.br"
            aria-invalid={Boolean(errors.email)}
            {...form.register('email')}
          />
        </CampoFormulario>

        <CampoFormulario id="senha" rotulo="Senha" erro={errors.senha?.message}>
          <div className="relative">
            <Input
              id="senha"
              type={mostrarSenha ? 'text' : 'password'}
              autoComplete="current-password"
              className="pr-10"
              aria-invalid={Boolean(errors.senha)}
              {...form.register('senha')}
            />
            <button
              type="button"
              onClick={() => setMostrarSenha((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-texto-secundario hover:text-texto"
              aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </CampoFormulario>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : <LogIn />}
          Entrar
        </Button>

        <p className="text-center text-xs text-texto-secundario">
          Esqueceu a senha? Peça ao administrador para redefini-la.
        </p>
      </form>
    </AuthLayout>
  )
}
