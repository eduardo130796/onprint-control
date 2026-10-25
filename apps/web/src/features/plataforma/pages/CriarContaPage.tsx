import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Check, Loader2, Rocket, TicketPercent } from 'lucide-react'
import { toast } from 'sonner'
import { cadastroPublicoSchema, formatarMoeda, mensalNoAnual, type CadastroPublicoInput, type CicloAssinatura } from '@onprint/shared'
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
  planos: { codigo: string; nome: string; descricao: string | null; valorMensal: string; valorAnual: string | null; limiteUsuarios: number | null; diasTeste: number }[]
}

type PlanoPublico = PlanosPublicos['planos'][number]

/** Plano único: o que vem depois do teste, sem nada para escolher */
function PlanoUnico({ plano, ciclo }: { plano: PlanoPublico; ciclo: CicloAssinatura }) {
  const anual = ciclo === 'anual' && plano.valorAnual
  return (
    <div className="flex items-start gap-3 rounded-xl border border-marca/40 bg-marca-suave/60 p-3 text-sm">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-marca-escuro" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold text-tinta">
          Depois do teste: {plano.nome} por {formatarMoeda(anual ? mensalNoAnual(plano.valorAnual as string) : plano.valorMensal)}/mês
        </span>
        {anual && <span className="text-texto-secundario"> no anual ({formatarMoeda(plano.valorAnual as string)} por ano)</span>}
        <span className="block text-xs text-texto-secundario">Tudo incluído, com WhatsApp e vitrine online, e usuários ilimitados. Sem fidelidade.</span>
      </p>
    </div>
  )
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
  const [params] = useSearchParams()
  // Vindo da página de planos: o plano e o ciclo já chegam escolhidos
  const [plano, setPlano] = useState<string | undefined>(params.get('plano') ?? undefined)
  const ciclo: CicloAssinatura = params.get('ciclo') === 'anual' ? 'anual' : 'mensal'
  const cupomDoLink = params.get('cupom')?.toUpperCase() ?? ''
  const [abrirCupom, setAbrirCupom] = useState(Boolean(cupomDoLink))
  const form = useForm<CadastroPublicoInput>({ resolver: zodResolver(cadastroPublicoSchema), defaultValues: { empresa: '', nome: '', email: '', telefone: '', senha: '', site: '', cupom: cupomDoLink, exemplos: true } })
  const codigoCupom = String(form.watch('cupom') ?? '').trim().toUpperCase()
  const [cupomConferido, setCupomConferido] = useState(cupomDoLink)
  const { errors, isSubmitting } = form.formState
  const escolhido = plano && info.data?.planos.some((p) => p.codigo === plano) ? plano : info.data?.planoPadrao
  const diasTeste = info.data?.planos.find((p) => p.codigo === escolhido)?.diasTeste ?? 14
  // Confere o cupom ao sair do campo (e para o plano escolhido): mostra o desconto antes de criar a conta
  const cupom = useQuery({
    queryKey: ['cupom-publico', cupomConferido, escolhido],
    queryFn: () => publico<{ codigo: string; descricao: string }>(`/cupons/validar?codigo=${encodeURIComponent(cupomConferido)}&plano=${encodeURIComponent(escolhido ?? '')}`),
    enabled: cupomConferido.length >= 3 && Boolean(escolhido),
    retry: false,
  })

  const criar = form.handleSubmit(async (dados) => {
    try {
      if (dados.cupom && cupom.isError) return toast.error((cupom.error as Error).message)
      await publico('/cadastro', { ...dados, plano: escolhido, ciclo })
      await entrar({ email: dados.email, senha: dados.senha })
      toast.success('Conta criada! Bem-vindo(a) à GrafyGo.')
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
    <AuthLayout titulo="Criar conta" descricao={`${diasTeste} dias grátis com tudo liberado, sem cartão. Você só paga se decidir continuar.`}>
      <form onSubmit={criar} className="space-y-4" noValidate>
        {info.data?.planos.length === 1 && info.data.planos[0] ? (
          <PlanoUnico plano={info.data.planos[0]} ciclo={ciclo} />
        ) : info.data ? (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Plano de interesse {ciclo === 'anual' && <span className="font-normal text-texto-secundario">(pagamento anual)</span>}</legend>
            <div className="grid gap-2">
              {info.data.planos.map((p) => (
                <label key={p.codigo} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm', escolhido === p.codigo ? 'border-marca ring-2 ring-marca' : 'border-border hover:bg-fundo')}>
                  <input type="radio" name="plano" className="sr-only" checked={escolhido === p.codigo} onChange={() => setPlano(p.codigo)} />
                  {escolhido === p.codigo ? <Check className="h-4 w-4 text-marca-escuro" /> : <span className="h-4 w-4" />}
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-tinta">{p.nome}</span> · {formatarMoeda(ciclo === 'anual' && p.valorAnual ? mensalNoAnual(p.valorAnual) : p.valorMensal)}/mês
                    <span className="block text-xs text-texto-secundario">{p.descricao}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
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
        {abrirCupom ? (
          <CampoFormulario id="cc-cupom" rotulo="Cupom de desconto (opcional)" erro={errors.cupom?.message ?? (cupom.isError && codigoCupom === cupomConferido ? (cupom.error as Error).message : undefined)}>
            <Input id="cc-cupom" className="font-mono uppercase" {...form.register('cupom', { onBlur: () => setCupomConferido(codigoCupom) })} />
          </CampoFormulario>
        ) : (
          <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium text-marca-escuro hover:underline" onClick={() => setAbrirCupom(true)}>
            <TicketPercent className="h-4 w-4" aria-hidden="true" /> Tenho um cupom de desconto
          </button>
        )}
        {cupom.data && codigoCupom === cupomConferido && (
          <p className="flex items-center gap-2 rounded-xl bg-marca-suave px-3 py-2 text-sm text-tinta">
            <TicketPercent className="h-4 w-4 text-marca-escuro" aria-hidden="true" />
            <span>
              <strong className="font-mono">{cupom.data.codigo}</strong>: {cupom.data.descricao}. Vale quando você assinar, depois do teste.
            </span>
          </p>
        )}
        <label className="flex items-start gap-2 rounded-xl bg-marca-suave/60 p-3 text-sm">
          <Checkbox className="mt-0.5" {...form.register('exemplos')} />
          <span>
            <strong className="text-tinta">Começar com produtos de exemplo</strong>
            <span className="block text-xs text-texto-secundario">Banner, adesivo, cartão e outros, já com preço: faça um orçamento no primeiro minuto. Dá para editar ou apagar depois.</span>
          </span>
        </label>
        {/* Armadilha para robôs: invisível para pessoas */}
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" {...form.register('site')} />
        <label className="flex items-start gap-2 text-sm">
          <Checkbox className="mt-0.5" {...form.register('aceite')} />
          <span>
            Li e aceito os{' '}
            <Link to="/termos" target="_blank" className="font-medium text-marca-escuro hover:underline">
              termos de uso
            </Link>{' '}
            e a{' '}
            <Link to="/privacidade" target="_blank" className="font-medium text-marca-escuro hover:underline">
              política de privacidade
            </Link>
            .
          </span>
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
