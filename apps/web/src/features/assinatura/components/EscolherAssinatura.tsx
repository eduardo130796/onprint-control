import { forwardRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CreditCard, Loader2, Lock, QrCode, Receipt, TicketPercent, X, Zap } from 'lucide-react'
import { toast } from 'sonner'
import {
  FORMAS_AUTOMATICAS,
  FORMA_ASSINATURA_DETALHES,
  FORMA_ASSINATURA_ROTULOS,
  assinarSchema,
  formatarDataSimples,
  formatarMoeda,
  hojeISO,
  type FormaAssinatura,
  type MinhaAssinatura,
} from '@onprint/shared'
import { assinaturaApi } from '@/api/assinatura'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { mascaraCpfCnpj } from '@/lib/mascaras'
import { cn } from '@/lib/utils'
import { CartoesPlanos } from './CartoesPlanos'

const ICONE: Record<FormaAssinatura, typeof QrCode> = { pix_automatico: QrCode, cartao: CreditCard, pix_boleto: Receipt }

function Titulo({ passo, children, detalhe }: { passo: number; children: React.ReactNode; detalhe?: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-grafite font-titulo text-sm font-extrabold text-white">{passo}</span>
      <div>
        <h3 className="font-titulo text-lg font-extrabold text-grafite">{children}</h3>
        {detalhe && <p className="text-sm text-texto-secundario">{detalhe}</p>}
      </div>
    </div>
  )
}

/** Assinar pelo pagamento online em três passos: plano, forma de pagamento e dados da cobrança. */
export const EscolherAssinatura = forwardRef<HTMLElement, { a: MinhaAssinatura }>(function EscolherAssinatura({ a }, ref) {
  const queryClient = useQueryClient()
  const [plano, setPlano] = useState(a.plano.codigo)
  const [forma, setForma] = useState<FormaAssinatura>(a.formasDisponiveis[0] ?? 'cartao')
  const [documento, setDocumento] = useState(mascaraCpfCnpj(a.documentoSugerido))
  const [erro, setErro] = useState<string>()
  const assinar = useMutation({ mutationFn: assinaturaApi.assinar, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assinatura'] }) })
  const escolhido = a.planos.find((p) => p.codigo === plano)
  // Cupom: o guardado no cadastro já vale; outro digitado aqui é conferido para o plano escolhido
  const [abrirCupom, setAbrirCupom] = useState(false)
  const [cupomDigitado, setCupomDigitado] = useState('')
  const [cupom, setCupom] = useState<string | null>(null)
  const conferido = useQuery({ queryKey: ['assinatura', 'cupom', cupom, plano], queryFn: () => assinaturaApi.conferirCupom(cupom as string, plano), enabled: Boolean(cupom), retry: false })
  const cupomValido = cupom && conferido.data ? conferido.data : null
  const descontoGuardado = !cupom && a.cupom && plano === a.plano.codigo ? a.cupom : null
  const valorFinal = cupomValido?.valor ?? (descontoGuardado && escolhido ? (Number(escolhido.valorMensal) - Number(descontoGuardado.desconto)).toFixed(2) : null)
  const fimGratis = a.situacao === 'teste' ? a.testeAte : a.situacao === 'cortesia' ? (a.cortesia?.ate ?? null) : null
  const fimTeste = fimGratis && fimGratis > hojeISO() ? fimGratis : null
  const primeira = forma === 'pix_automatico' || !fimTeste ? 'hoje' : formatarDataSimples(fimTeste)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const dados = assinarSchema.safeParse({ plano, forma, cpfCnpj: documento })
    if (!dados.success) return setErro(dados.error.issues[0]?.message)
    if (cupom && !cupomValido) return toast.error(conferido.isError ? (conferido.error as Error).message : 'Aguarde a conferência do cupom.')
    try {
      const r = await assinar.mutateAsync({ plano, forma, cpfCnpj: documento, ...(cupomValido ? { cupom: cupomValido.codigo } : {}) })
      if (r.linkPagamento) window.open(r.linkPagamento, '_blank', 'noopener')
      toast.success(forma === 'pix_automatico' ? 'Pronto! Agora é só ler o QR Code no app do seu banco.' : 'Assinatura criada. Se a página de pagamento não abriu, use o botão "Pagar".', { duration: 8000 })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <section ref={ref} className="scroll-mt-24 space-y-8 rounded-3xl bg-card p-6 shadow-suave sm:p-8" aria-label="Assinar">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-marca-escuro">{a.situacao === 'teste' || a.situacao === 'cortesia' ? 'Continue sem interrupção' : a.situacao === 'cancelada' ? 'Volte a usar o ONPrint' : 'Regularize pelo pagamento online'}</p>
        <h2 className="mt-1 font-titulo text-2xl font-extrabold text-grafite sm:text-3xl">Escolha como assinar</h2>
      </div>

      <div>
        <Titulo passo={1}>Plano</Titulo>
        <CartoesPlanos planos={a.planos} selecionado={plano} onEscolher={setPlano} />
      </div>

      <div>
        <Titulo passo={2} detalhe="Você pode trocar depois.">
          Forma de pagamento
        </Titulo>
        <div className={cn('grid gap-3', a.formasDisponiveis.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
          {a.formasDisponiveis.map((f) => {
            const Icone = ICONE[f]
            const marcado = forma === f
            return (
              <button
                key={f}
                type="button"
                aria-pressed={marcado}
                onClick={() => setForma(f)}
                className={cn(
                  'relative flex gap-4 rounded-2xl p-5 text-left ring-1 transition',
                  marcado ? 'bg-marca-suave ring-2 ring-marca' : 'bg-card ring-border hover:bg-fundo',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-escuro',
                )}
              >
                <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', marcado ? 'bg-marca text-marca-contraste' : 'bg-fundo text-grafite')}>
                  <Icone className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="flex flex-wrap items-center gap-2 font-semibold text-grafite">
                    {FORMA_ASSINATURA_ROTULOS[f]}
                    {FORMAS_AUTOMATICAS.includes(f) && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-grafite px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        <Zap className="h-3 w-3" aria-hidden="true" /> Automático
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-sm text-texto-secundario">{FORMA_ASSINATURA_DETALHES[f]}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <form onSubmit={enviar} noValidate className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <Titulo passo={3} detalhe="Vai na cobrança e na nota fiscal da mensalidade.">
            Dados da cobrança
          </Titulo>
          <label htmlFor="as-doc" className="text-sm font-medium">
            CNPJ (ou CPF)
          </label>
          <Input
            id="as-doc"
            inputMode="numeric"
            className="mt-1.5 h-12 text-base"
            value={documento}
            aria-invalid={Boolean(erro)}
            aria-describedby={erro ? 'as-doc-erro' : undefined}
            onChange={(e) => {
              setDocumento(mascaraCpfCnpj(e.target.value))
              setErro(undefined)
            }}
          />
          {erro && (
            <p id="as-doc-erro" className="mt-1.5 text-sm text-coral-escuro">
              {erro}
            </p>
          )}
          <div className="mt-5">
            {cupomValido || (descontoGuardado && !cupom) ? (
              <p className="flex flex-wrap items-center gap-2 rounded-xl bg-marca-suave px-3 py-2 text-sm text-grafite">
                <TicketPercent className="h-4 w-4 text-marca-escuro" aria-hidden="true" />
                Cupom <strong className="font-mono">{cupomValido?.codigo ?? descontoGuardado?.codigo}</strong>: {cupomValido?.descricao ?? descontoGuardado?.descricao}
                {cupomValido && (
                  <button type="button" className="ml-auto rounded p-1 text-texto-secundario hover:bg-white/60" aria-label="Remover cupom" onClick={() => setCupom(null)}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </p>
            ) : abrirCupom || cupom ? (
              <div>
                <label htmlFor="as-cupom" className="text-sm font-medium">
                  Cupom de desconto
                </label>
                <div className="mt-1.5 flex gap-2">
                  <Input id="as-cupom" className="h-11 font-mono uppercase" value={cupomDigitado} onChange={(e) => setCupomDigitado(e.target.value.toUpperCase())} aria-invalid={conferido.isError} />
                  <Button type="button" variant="outline" className="h-11" disabled={!cupomDigitado.trim() || conferido.isFetching} onClick={() => setCupom(cupomDigitado.trim())}>
                    {conferido.isFetching && <Loader2 className="animate-spin" />} Aplicar
                  </Button>
                </div>
                {conferido.isError && <p className="mt-1.5 text-sm text-coral-escuro">{(conferido.error as Error).message}</p>}
              </div>
            ) : (
              <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium text-marca-escuro hover:underline" onClick={() => setAbrirCupom(true)}>
                <TicketPercent className="h-4 w-4" aria-hidden="true" /> Tenho um cupom de desconto
              </button>
            )}
          </div>
          <p className="mt-4 flex items-start gap-2 text-xs text-texto-secundario">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Pagamento processado pelo Asaas, instituição autorizada pelo Banco Central. Os dados do cartão são digitados na página do Asaas e não passam pelo ONPrint.
          </p>
        </div>

        <aside className="rounded-2xl bg-grafite p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Resumo</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-white/60">Plano</dt>
              <dd className="font-semibold">{escolhido?.nome}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-white/60">Pagamento</dt>
              <dd className="text-right font-semibold">{FORMA_ASSINATURA_ROTULOS[forma]}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-white/60">1ª mensalidade</dt>
              <dd className="font-semibold">{primeira}</dd>
            </div>
          </dl>
          <p className="mt-5 border-t border-white/10 pt-5">
            <span className="font-titulo text-3xl font-extrabold">{escolhido && formatarMoeda(valorFinal ?? escolhido.valorMensal)}</span>
            <span className="text-sm text-white/60">/mês</span>
            {valorFinal && escolhido && <span className="ml-2 text-sm text-white/50 line-through">{formatarMoeda(escolhido.valorMensal)}</span>}
          </p>
          {(cupomValido || descontoGuardado) && <p className="mt-1 text-xs text-marca">{cupomValido?.descricao ?? descontoGuardado?.descricao}</p>}
          {forma === 'pix_automatico' && fimTeste && <p className="mt-2 text-xs text-amber-200">No PIX Automático a 1ª mensalidade é paga na autorização, hoje; o teste grátis termina nesse momento.</p>}
          {forma !== 'pix_automatico' && fimTeste && <p className="mt-2 text-xs text-white/60">Você não perde nenhum dia {a.situacao === 'cortesia' ? 'da cortesia' : 'do teste grátis'}.</p>}
          <Button type="submit" size="lg" className="mt-5 w-full" disabled={assinar.isPending}>
            {assinar.isPending && <Loader2 className="animate-spin" />}
            {forma === 'pix_automatico' ? 'Gerar QR Code do PIX' : 'Assinar e ir para o pagamento'}
          </Button>
        </aside>
      </form>
    </section>
  )
})
