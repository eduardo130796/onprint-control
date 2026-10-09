import { AlertTriangle, Ban, CalendarX, CheckCircle2, ExternalLink, Eye, Gift, Hourglass, ShieldCheck, Sparkles } from 'lucide-react'
import { FORMA_ASSINATURA_ROTULOS, formatarDataSimples, formatarMoeda, type MinhaAssinatura } from '@onprint/shared'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { statusDaAssinatura, type TomStatus } from '../status'

const TOM: Record<TomStatus, { faixa: string; icone: string; fundo: string }> = {
  verde: { faixa: 'bg-marca', icone: 'bg-marca-suave text-marca-escuro', fundo: 'bg-card' },
  azul: { faixa: 'bg-sky-500', icone: 'bg-sky-100 text-sky-800', fundo: 'bg-card' },
  violeta: { faixa: 'bg-violet-500', icone: 'bg-violet-100 text-violet-800', fundo: 'bg-card' },
  ambar: { faixa: 'bg-amber-500', icone: 'bg-amber-100 text-amber-800', fundo: 'bg-amber-50' },
  coral: { faixa: 'bg-coral', icone: 'bg-coral/15 text-coral-escuro', fundo: 'bg-coral/5' },
  vermelho: { faixa: 'bg-red-600', icone: 'bg-red-100 text-red-700', fundo: 'bg-red-50' },
  cinza: { faixa: 'bg-slate-400', icone: 'bg-slate-100 text-slate-700', fundo: 'bg-card' },
}

const ICONE: Record<TomStatus, typeof Eye> = { verde: CheckCircle2, azul: Sparkles, violeta: Gift, ambar: AlertTriangle, coral: Eye, vermelho: Ban, cinza: CalendarX }

/** Texto de apoio: o que significa a situação e o que vem a seguir. */
function detalhe(a: MinhaAssinatura): string {
  const m = a.acesso.motivo
  if (m === 'em_dia') {
    if (!a.proximoVencimento) return 'Nenhuma mensalidade em aberto.'
    const valor = a.cobrancasAbertas[0]?.valor ?? (a.cupom ? (Number(a.plano.valorMensal) - Number(a.cupom.desconto)).toFixed(2) : a.plano.valorMensal)
    const forma = a.formaPagamento ? ` · ${FORMA_ASSINATURA_ROTULOS[a.formaPagamento]}` : ''
    return `Próxima cobrança em ${formatarDataSimples(a.proximoVencimento)}: ${formatarMoeda(valor)}${forma}.`
  }
  if (m === 'cortesia') return a.cortesia?.ate ? `Sem mensalidade até ${formatarDataSimples(a.cortesia.ate)}. Depois disso, é só assinar para continuar.` : 'Sua assinatura é cortesia: o sistema é liberado sem mensalidade.'
  if (m === 'teste' || m === 'teste_acabando') return 'Assine quando quiser: a 1ª mensalidade só vence no fim do teste e você não perde nenhum dia.'
  return a.acesso.mensagem
}

/**
 * Situação da assinatura no topo da tela, antes de tudo: em dia, teste, cortesia, atraso (com quanto falta
 * para cada etapa), só leitura ou bloqueio, e a ação do momento.
 */
export function CabecalhoStatus({ a, onAssinar }: { a: MinhaAssinatura; onAssinar: () => void }) {
  const s = statusDaAssinatura(a.acesso, { situacao: a.situacao, cancelarEm: a.cancelarEm })
  const t = TOM[s.tom]
  const Icone = a.acesso.motivo === 'teste_acabando' ? Hourglass : a.acesso.motivo === 'liberacao_manual' ? ShieldCheck : ICONE[s.tom]
  const total = a.cobrancasAbertas.reduce((soma, c) => soma + Number(c.valor), 0).toFixed(2)
  const vencidas = a.cobrancasAbertas.filter((c) => c.situacao === 'vencida')
  const precisaPagar = vencidas.length > 0 || a.acesso.nivel !== 'normal'
  const podeAssinar = !a.assinadaOnline && a.pagamentoOnline && a.podeGerenciar && !(a.cortesia && !a.cortesia.ate)

  let acao: React.ReactNode = null
  if (precisaPagar && a.cobrancasAbertas.length > 1) {
    acao = (
      <Button asChild>
        <a href="#cobrancas-abertas">
          Pagar {formatarMoeda(total)}
        </a>
      </Button>
    )
  } else if (precisaPagar && a.cobrancasAbertas[0]?.linkPagamento) {
    acao = (
      <Button asChild>
        <a href={a.cobrancasAbertas[0].linkPagamento} target="_blank" rel="noopener noreferrer">
          <ExternalLink /> Pagar {formatarMoeda(a.cobrancasAbertas[0].valor)}
        </a>
      </Button>
    )
  } else if (podeAssinar && a.acesso.motivo !== 'em_dia') {
    acao = (
      <Button onClick={onAssinar} variant={a.acesso.nivel === 'normal' ? 'outline' : 'default'}>
        <Sparkles /> {a.situacao === 'cancelada' ? 'Assinar de novo' : a.acesso.motivo === 'atraso' ? 'Regularizar agora' : 'Assinar agora'}
      </Button>
    )
  }

  return (
    <section aria-label="Situação da assinatura" role={a.acesso.nivel === 'normal' ? 'status' : 'alert'} className={cn('relative overflow-hidden rounded-3xl shadow-suave ring-1 ring-border', t.fundo)}>
      <span className={cn('absolute inset-y-0 left-0 w-2', t.faixa)} aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-4 py-5 pl-7 pr-5 sm:pr-6">
        <span className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl', t.icone)}>
          <Icone className="h-7 w-7" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-texto-secundario">Situação da assinatura</p>
          <p className="font-titulo text-2xl font-extrabold text-tinta">{s.rotulo}</p>
          <p className="mt-0.5 text-sm text-texto-secundario">{detalhe(a)}</p>
        </div>
        {precisaPagar && vencidas.length > 0 && (
          <div className="text-right">
            <p className="text-xs text-texto-secundario">{vencidas.length > 1 ? `${vencidas.length} cobranças vencidas` : 'Vencida'}</p>
            <p className="font-titulo text-xl font-extrabold tabular-nums text-tinta">{formatarMoeda(vencidas.reduce((soma, c) => soma + Number(c.valor), 0).toFixed(2))}</p>
          </div>
        )}
        {acao}
      </div>
    </section>
  )
}
