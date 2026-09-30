import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { KeyRound, Loader2, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { useAuth } from '@/hooks/useAuth'
import { AuthLayout } from '../components/AuthLayout'
import { trocarSenhaFormSchema, type TrocarSenhaForm } from '../schemas'

const CAMPOS: { nome: keyof TrocarSenhaForm; rotulo: string; autoComplete: string }[] = [
  { nome: 'senhaAtual', rotulo: 'Senha atual', autoComplete: 'current-password' },
  { nome: 'novaSenha', rotulo: 'Nova senha', autoComplete: 'new-password' },
  { nome: 'confirmacao', rotulo: 'Confirme a nova senha', autoComplete: 'new-password' },
]

/** Troca da própria senha. Obrigatória no primeiro acesso ou após redefinição pelo admin. */
export function TrocarSenhaPage() {
  const { usuario, trocarSenha, sair } = useAuth()
  const navigate = useNavigate()
  const obrigatoria = usuario?.deveTrocarSenha ?? false
  const form = useForm<TrocarSenhaForm>({
    resolver: zodResolver(trocarSenhaFormSchema),
    defaultValues: { senhaAtual: '', novaSenha: '', confirmacao: '' },
  })
  const { errors, isSubmitting } = form.formState

  async function onSubmit({ senhaAtual, novaSenha }: TrocarSenhaForm) {
    try {
      await trocarSenha({ senhaAtual, novaSenha })
      toast.success('Senha alterada com sucesso.')
      navigate('/', { replace: true })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <AuthLayout
      titulo={obrigatoria ? 'Defina uma nova senha' : 'Alterar senha'}
      descricao={
        obrigatoria
          ? 'Por segurança, troque a senha provisória antes de continuar.'
          : 'Informe a senha atual e a nova senha.'
      }
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {CAMPOS.map((c, i) => (
          <CampoFormulario key={c.nome} id={c.nome} rotulo={c.rotulo} erro={errors[c.nome]?.message}>
            <Input
              id={c.nome}
              type="password"
              autoComplete={c.autoComplete}
              autoFocus={i === 0}
              aria-invalid={Boolean(errors[c.nome])}
              {...form.register(c.nome)}
            />
          </CampoFormulario>
        ))}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : <KeyRound />}
          Salvar nova senha
        </Button>
        {obrigatoria ? (
          <Button type="button" variant="ghost" className="w-full" onClick={() => void sair()}>
            <LogOut /> Sair
          </Button>
        ) : (
          <Button type="button" variant="ghost" className="w-full" onClick={() => navigate(-1)}>
            Cancelar
          </Button>
        )}
      </form>
    </AuthLayout>
  )
}
