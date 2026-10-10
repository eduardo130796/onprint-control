import { useState } from 'react'
import { esquecerMotivoSaida, saiuPorInatividade } from '../useInatividade'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, LogIn, ShieldCheck } from 'lucide-react'
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
  const estado = location.state as { de?: string; email?: string } | null
  // Lido uma vez ao abrir a tela (a marca é apagada em seguida)
  // Todas as abas que saíram mostram o aviso; a marca some ao entrar de novo (ou sozinha em 10 min)
  const [porInatividade] = useState(saiuPorInatividade)
  const destino = estado?.de ?? '/'

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: estado?.email ?? '', senha: '' },
  })
  const { errors, isSubmitting } = form.formState

  if (carregando) return <TelaCarregando />
  if (usuario) return <Navigate to={destino} replace />

  async function onSubmit(valores: LoginInput) {
    try {
      const logado = await entrar(valores)
      esquecerMotivoSaida()
      navigate(logado.deveTrocarSenha ? '/trocar-senha' : destino, { replace: true })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <AuthLayout titulo="Entrar" descricao="Acesse com seu e-mail e senha.">
      {porInatividade && (
        <p role="status" className="mb-5 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Por segurança, o sistema saiu sozinho depois de um tempo sem uso. Entre de novo para continuar.
        </p>
      )}
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

        <p className="text-center text-sm">
          <Link to="/esqueci-senha" className="font-medium text-marca-escuro hover:underline">
            Esqueci minha senha
          </Link>
        </p>
        <p className="text-center text-sm text-texto-secundario">
          Ainda não usa a GrafyGo?{' '}
          <Link to="/criar-conta" className="font-medium text-marca-escuro hover:underline">
            Criar conta grátis
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
