import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, KeyRound, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { authApi } from '@/api/auth'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { TelaCarregando } from '@/components/shared/TelaCarregando'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuthLayout } from '../components/AuthLayout'
import { novaSenhaFormSchema, type NovaSenhaForm } from '../schemas'

/** Nova senha pelo link do e-mail ("esqueci a senha" ou convite de usuário novo). */
export function RedefinirSenhaPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const link = useQuery({ queryKey: ['link-senha', token], queryFn: () => authApi.consultarLinkSenha(token), enabled: token.length >= 20, retry: false })
  const form = useForm<NovaSenhaForm>({ resolver: zodResolver(novaSenhaFormSchema), defaultValues: { novaSenha: '', confirmacao: '' } })
  const { errors, isSubmitting } = form.formState

  if (token.length >= 20 && link.isPending) return <TelaCarregando />
  const dados = link.data
  if (!dados) {
    return (
      <AuthLayout titulo="Link inválido" descricao={(link.error as Error | null)?.message ?? 'Este link expirou ou já foi usado.'}>
        <div className="space-y-4">
          <Button className="w-full" onClick={() => navigate('/esqueci-senha')}>
            Pedir um novo link
          </Button>
          <Link to="/login" className="flex items-center justify-center gap-1 text-sm font-medium text-marca-escuro hover:underline">
            <ArrowLeft className="h-4 w-4" /> Voltar para o login
          </Link>
        </div>
      </AuthLayout>
    )
  }

  const convite = dados.finalidade === 'convite'
  async function onSubmit({ novaSenha }: NovaSenhaForm) {
    try {
      await authApi.redefinirSenha(token, novaSenha)
      toast.success(convite ? 'Senha criada. Agora é só entrar.' : 'Senha alterada. Entre com a senha nova.')
      navigate('/login', { replace: true, state: { email: dados?.email } })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <AuthLayout titulo={convite ? 'Crie sua senha' : 'Crie uma nova senha'} descricao={`${dados.nome.split(' ')[0]}, este é o seu acesso a ${dados.empresa} (${dados.email}).`}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {/* Ajuda o gerenciador de senhas a salvar a senha para o e-mail certo */}
        <input type="email" name="email" autoComplete="username" value={dados.email} readOnly hidden />
        <CampoFormulario id="novaSenha" rotulo="Nova senha" erro={errors.novaSenha?.message}>
          <Input id="novaSenha" type="password" autoComplete="new-password" autoFocus aria-invalid={Boolean(errors.novaSenha)} {...form.register('novaSenha')} />
        </CampoFormulario>
        <CampoFormulario id="confirmacao" rotulo="Confirme a nova senha" erro={errors.confirmacao?.message}>
          <Input id="confirmacao" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.confirmacao)} {...form.register('confirmacao')} />
        </CampoFormulario>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {convite ? 'Criar senha' : 'Salvar nova senha'}
        </Button>
      </form>
    </AuthLayout>
  )
}
