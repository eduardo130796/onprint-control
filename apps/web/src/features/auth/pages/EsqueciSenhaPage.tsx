import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2, MailCheck, Send } from 'lucide-react'
import { toast } from 'sonner'
import { esqueciSenhaSchema, type EsqueciSenhaInput } from '@onprint/shared'
import { authApi } from '@/api/auth'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuthLayout } from '../components/AuthLayout'

/** Pede o link de nova senha. A resposta é a mesma exista ou não a conta (não revela e-mails). */
export function EsqueciSenhaPage() {
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null)
  const form = useForm<EsqueciSenhaInput>({ resolver: zodResolver(esqueciSenhaSchema), defaultValues: { email: '' } })
  const { errors, isSubmitting } = form.formState

  async function onSubmit({ email }: EsqueciSenhaInput) {
    try {
      await authApi.esqueciSenha(email)
      setEnviadoPara(email)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (enviadoPara) {
    return (
      <AuthLayout titulo="Confira seu e-mail" descricao={`Se ${enviadoPara} tiver acesso ao sistema, enviamos um link para criar uma nova senha.`}>
        <div className="space-y-5 text-sm text-texto-secundario">
          <div className="flex gap-3 rounded-xl bg-fundo p-4">
            <MailCheck className="h-5 w-5 shrink-0 text-marca-escuro" aria-hidden="true" />
            <p>O link vale por 1 hora e só pode ser usado uma vez. Não chegou? Olhe a caixa de spam ou peça de novo daqui a alguns minutos.</p>
          </div>
          <Button variant="outline" className="w-full" onClick={() => setEnviadoPara(null)}>
            Pedir outro link
          </Button>
          <Link to="/login" className="flex items-center justify-center gap-1 font-medium text-marca-escuro hover:underline">
            <ArrowLeft className="h-4 w-4" /> Voltar para o login
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout titulo="Esqueci minha senha" descricao="Informe o e-mail de acesso. Enviaremos um link para você criar uma senha nova.">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <CampoFormulario id="email" rotulo="E-mail" erro={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" autoFocus placeholder="voce@empresa.com.br" aria-invalid={Boolean(errors.email)} {...form.register('email')} />
        </CampoFormulario>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : <Send />}
          Enviar link
        </Button>
        <Link to="/login" className="flex items-center justify-center gap-1 text-sm font-medium text-marca-escuro hover:underline">
          <ArrowLeft className="h-4 w-4" /> Voltar para o login
        </Link>
      </form>
    </AuthLayout>
  )
}
