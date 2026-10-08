import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Check, Loader2, Rocket } from 'lucide-react'
import { toast } from 'sonner'
import { cadastroPublicoSchema, formatarMoeda, type CadastroPublicoInput } from '@onprint/shared'
import { API_BASE, ErroApi } from '@/api/http'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { PhoneInput } from '@/components/shared/inputs'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { AuthLayout } from '@/features/auth/components/AuthLayout'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

interface PlanosPublicos {
  cadastroAberto: boolean
  planoPadrao: string
  planos: { codigo: string; nome: string; descricao: string | null; valorMensal: string; limiteUsuarios: number | null; diasTeste: number }[]
}

async function publico<T>(caminho: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API_BASE}/plataforma${caminho}`, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body === undefined ? undefined : JSON.stringify(body) })
  const corpo = await r.json().catch(() => null)
  if (!r.ok) throw new ErroApi(r.status, corpo?.error?.code ?? 'ERRO_INTERNO', corpo?.error?.message ?? 'Não foi possível criar a conta.')
  return corpo as T
}

/** "Criar conta": a gráfica se cadastra sozinha e entra direto, em teste grátis (sem cartão). */
export function CriarContaPage() {
  const navigate = useNavigate()
  const { entrar } = useAuth()
  const info = useQuery({ queryKey: ['planos-publicos'], queryFn: () => publico<PlanosPublicos>('/planos-publicos') })
  const [plano, setPlano] = useState<string>()
  const form = useForm<CadastroPublicoInput>({ resolver: zodResolver(cadastroPublicoSchema), defaultValues: { empresa: '', nome: '', email: '', telefone: '', senha: '', site: '' } })
  const { errors, isSubmitting } = form.formState
  const escolhido = plano ?? info.data?.planoPadrao
  const diasTeste = info.data?.planos.find((p) => p.codigo === escolhido)?.diasTeste ?? 14

  const criar = form.handleSubmit(async (dados) => {
    try {
      await publico('/cadastro', { ...dados, plano: escolhido })
      await entrar({ email: dados.email, senha: dados.senha })
      toast.success('Conta criada! Bem-vindo(a) ao ONPrint Control.')
      navigate('/', { replace: true })
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  if (info.data && !info.data.cadastroAberto) {
    return (
      <AuthLayout titulo="Cadastro fechado" descricao="No momento, novas contas são criadas pelo nosso time. Fale com o suporte.">
        <Link to="/login" className="text-sm font-medium text-marca-escuro hover:underline">
          Já tenho conta: entrar
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout titulo="Criar conta" descricao={`${diasTeste} dias grátis, sem cartão. Seus dados ficam guardados se depois quiser assinar.`}>
      <form onSubmit={criar} className="space-y-4" noValidate>
        {info.data && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Plano para testar</legend>
            <div className="grid gap-2">
              {info.data.planos.map((p) => (
                <label key={p.codigo} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm', escolhido === p.codigo ? 'border-marca ring-2 ring-marca' : 'border-border hover:bg-fundo')}>
                  <input type="radio" name="plano" className="sr-only" checked={escolhido === p.codigo} onChange={() => setPlano(p.codigo)} />
                  {escolhido === p.codigo ? <Check className="h-4 w-4 text-marca-escuro" /> : <span className="h-4 w-4" />}
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-grafite">{p.nome}</span> · {formatarMoeda(p.valorMensal)}/mês
                    <span className="block text-xs text-texto-secundario">{p.descricao}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <CampoFormulario id="cc-empresa" rotulo="Nome da empresa" erro={errors.empresa?.message}>
          <Input id="cc-empresa" autoComplete="organization" {...form.register('empresa')} />
        </CampoFormulario>
        <CampoFormulario id="cc-nome" rotulo="Seu nome" erro={errors.nome?.message}>
          <Input id="cc-nome" autoComplete="name" {...form.register('nome')} />
        </CampoFormulario>
        <CampoFormulario id="cc-email" rotulo="E-mail (será seu login)" erro={errors.email?.message}>
          <Input id="cc-email" type="email" autoComplete="email" {...form.register('email')} />
        </CampoFormulario>
        <CampoFormulario id="cc-telefone" rotulo="WhatsApp (opcional)" erro={errors.telefone?.message}>
          <PhoneInput id="cc-telefone" {...form.register('telefone')} />
        </CampoFormulario>
        <CampoFormulario id="cc-senha" rotulo="Crie uma senha" erro={errors.senha?.message}>
          <Input id="cc-senha" type="password" autoComplete="new-password" {...form.register('senha')} />
        </CampoFormulario>
        {/* Armadilha para robôs: invisível para pessoas */}
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" {...form.register('site')} />
        <label className="flex items-start gap-2 text-sm">
          <Checkbox className="mt-0.5" {...form.register('aceite')} />
          <span>Li e aceito os termos de uso e a política de privacidade.</span>
        </label>
        {errors.aceite && <p className="text-xs text-coral-escuro">{errors.aceite.message}</p>}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : <Rocket />}
          {isSubmitting ? 'Preparando sua conta…' : 'Criar conta grátis'}
        </Button>
        <p className="text-center text-sm">
          Já tem conta?{' '}
          <Link to="/login" className="font-medium text-marca-escuro hover:underline">
            Entrar
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
