import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { loginSchema, type LoginInput } from '@onprint/shared'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuthLayout } from '@/features/auth/components/AuthLayout'
import { plataformaApi, sessaoPlataforma } from '../api'

/** Login do painel da plataforma (dono do sistema / suporte), separado do login das gráficas. */
export function PlataformaLoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', senha: '' } })
  const { errors, isSubmitting } = form.formState

  async function entrar(dados: LoginInput) {
    try {
      const r = await plataformaApi.login(dados.email, dados.senha)
      sessaoPlataforma.definir(r.accessToken)
      queryClient.removeQueries({ queryKey: ['plataforma'] })
      navigate('/plataforma', { replace: true })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <AuthLayout titulo="Painel da plataforma" descricao="Acesso do administrador do sistema (assinaturas, planos e cobranças).">
      <form onSubmit={form.handleSubmit(entrar)} className="space-y-5" noValidate>
        <CampoFormulario id="pl-email" rotulo="E-mail" erro={errors.email?.message}>
          <Input id="pl-email" type="email" autoComplete="username" autoFocus {...form.register('email')} />
        </CampoFormulario>
        <CampoFormulario id="pl-senha" rotulo="Senha" erro={errors.senha?.message}>
          <Input id="pl-senha" type="password" autoComplete="current-password" {...form.register('senha')} />
        </CampoFormulario>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Entrar no painel
        </Button>
      </form>
    </AuthLayout>
  )
}
