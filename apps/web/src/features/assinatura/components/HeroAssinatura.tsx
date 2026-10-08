import { CalendarClock, CreditCard, ExternalLink, Layers, QrCode, Receipt, Sparkles, Users } from 'lucide-react'
import { FORMA_ASSINATURA_ROTULOS, MODULO_ROTULOS, formatarDataSimples, formatarMoeda, type MinhaAssinatura, type Modulo } from '@onprint/shared'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Tom = 'verde' | 'azul' | 'ambar' | 'coral' | 'vermelho' | 'cinza'

const TOM: Record<Tom, { ponto: string; pilula: string }> = {
  verde: { ponto: 'bg-marca', pilula: 'bg-marca/15 text-marca ring-marca/30' },
  azul: { ponto: 'bg-sky-400', pilula: 'bg-sky-400/15 text-sky-200 ring-sky-300/30' },
  ambar: { ponto: 'bg-amber-400', pilula: 'bg-amber-400/15 text-amber-200 ring-amber-300/30' },
  coral: { ponto: 'bg-coral', pilula: 'bg-coral/20 text-red-200 ring-coral/40' },
  vermelho: { ponto: 'bg-red-500', pilula: 'bg-red-500/20 text-red-200 ring-red-400/40' },
  cinza: { ponto: 'bg-white/50', pilula: 'bg-white/10 text-white/80 ring-white/20' },
}

/** Situação em uma palavra (pílula do cartão) e o tom de cor dela. */
function statusDaAssinatura(a: MinhaAssinatura): { rotulo: string; tom: Tom } {
  const { acesso } = a
  if (acesso.motivo === 'renovacao_pendente') return { rotulo: 'Aguardando o 1º pagamento', tom: 'ambar' }
  if (a.situacao === 'cancelada') return { rotulo: 'Cancelada', tom: 'cinza' }
  if (acesso.motivo === 'bloqueio_manual') return { rotulo: 'Suspensa', tom: 'vermelho' }
  if (acesso.nivel === 'bloqueado') return { rotulo: 'Bloqueada por atraso', tom: 'vermelho' }
  if (acesso.nivel === 'somente_leitura') return { rotulo: 'Somente leitura', tom: 'coral' }
  if (acesso.motivo === 'teste' || acesso.motivo === 'teste_acabando') {
    const d = acesso.diasRestantesTeste ?? 0
    return { rotulo: d === 0 ? 'Teste grátis · último dia' : `Teste grátis · ${d} ${d === 1 ? 'dia restante' : 'dias restantes'}`, tom: acesso.nivel === 'aviso' ? 'ambar' : 'azul' }
  }
  if (acesso.nivel === 'aviso') return { rotulo: `Vencida há ${acesso.diasAtraso} ${acesso.diasAtraso === 1 ? 'dia' : 'dias'}`, tom: 'ambar' }
  if (a.cancelarEm) return { rotulo: `Ativa até ${formatarDataSimples(a.cancelarEm)}`, tom: 'cinza' }
  if (acesso.motivo === 'liberacao_manual') return { rotulo: 'Liberada pelo suporte', tom: 'azul' }
  return { rotulo: 'Ativa · em dia', tom: 'verde' }
}

/** Anel de progresso (dias de teste que faltam). */
function Anel({ valor, total, rotulo, legenda }: { valor: number; total: number; rotulo: string; legenda: string }) {
  const r = 46
  const c = 2 * Math.PI * r
  const fracao = total > 0 ? Math.max(0, Math.min(1, valor / total)) : 0
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 110 110" className="h-24 w-24 -rotate-90" aria-hidden="true">
        <circle cx="55" cy="55" r={r} fill="none" stroke="currentColor" strokeWidth="9" className="text-white/10" />
        <circle cx="55" cy="55" r={r} fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" className="text-marca" strokeDasharray={c} strokeDashoffset={c * (1 - fracao)} />
      </svg>
      <div>
        <p className="font-titulo text-3xl font-extrabold leading-none">{rotulo}</p>
        <p className="mt-1 text-sm text-white/60">{legenda}</p>
      </div>
    </div>
  )
}

function Medidor({ usado, limite }: { usado: number; limite: number | null }) {
  const pct = limite ? Math.min(100, Math.round((usado / limite) * 100)) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="inline-flex items-center gap-1.5 text-white/70">
          <Users className="h-4 w-4" aria-hidden="true" /> Usuários
        </span>
        <span className="font-semibold">
          {usado}
          <span className="text-white/50"> / {limite ?? '∞'}</span>
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-laranja' : 'bg-marca')} style={{ width: limite ? `${pct}%` : '12%' }} />
      </div>
    </div>
  )
}

const ICONE_FORMA = { pix_automatico: QrCode, cartao: CreditCard, pix_boleto: Receipt } as const

/**
 * Cartão principal de "Minha assinatura": plano, preço, situação, próxima cobrança, forma de pagamento,
 * uso de usuários e a ação mais importante do momento (pagar ou assinar).
 */
export function HeroAssinatura({ a, onAssinar }: { a: MinhaAssinatura; onAssinar: () => void }) {
  const status = statusDaAssinatura(a)
  const tom = TOM[status.tom]
  const aberta = a.cobrancaAberta
  const noTeste = a.acesso.diasRestantesTeste !== null
  const IconeForma = a.formaPagamento ? ICONE_FORMA[a.formaPagamento] : CreditCard
  const modulos = a.modulos.filter((m) => m.incluido)
  const emAtraso = a.acesso.diasAtraso > 0 && Boolean(a.atrasoDesde)
  const textoAssinar = a.situacao === 'teste' ? 'Assinar agora' : a.situacao === 'cancelada' ? 'Assinar de novo' : 'Regularizar agora'

  return (
    <section className="relative overflow-hidden rounded-3xl bg-grafite text-white shadow-xl" aria-label="Sua assinatura">
      <div className="pointer-events-none absolute -right-28 -top-32 h-80 w-80 rounded-full bg-marca/25 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-36 left-1/3 h-72 w-72 rounded-full bg-laranja/10 blur-3xl" aria-hidden="true" />
      <div className="flex h-1.5" aria-hidden="true">
        <span className="w-16 bg-laranja" />
        <span className="flex-1 bg-marca" />
      </div>

      <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Seu plano</p>
          <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
            <h2 className="font-titulo text-4xl font-extrabold tracking-tight sm:text-5xl">{a.plano.nome}</h2>
            <p className="pb-1 text-white/80">
              <span className="font-titulo text-2xl font-extrabold text-white">{formatarMoeda(a.plano.valorMensal)}</span>
              <span className="text-sm">/mês</span>
            </p>
          </div>

          <span className={cn('mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ring-1', tom.pilula)}>
            <span className={cn('h-2 w-2 rounded-full', tom.ponto)} aria-hidden="true" />
            {status.rotulo}
          </span>
          {/* A pílula já diz "em dia" ou "teste grátis": a mensagem só aparece quando explica algo a mais */}
          {!['em_dia', 'teste', 'teste_acabando'].includes(a.acesso.motivo) && <p className="mt-3 max-w-xl text-sm text-white/70">{a.acesso.mensagem}</p>}

          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
            <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <dt className="flex items-center gap-1.5 text-white/60">
                <CalendarClock className="h-4 w-4" aria-hidden="true" /> {noTeste ? 'Teste até' : emAtraso ? 'Em atraso desde' : 'Próxima cobrança'}
              </dt>
              <dd className={cn('mt-1 font-semibold', emAtraso && 'text-amber-200')}>
                {noTeste && a.testeAte ? formatarDataSimples(a.testeAte) : emAtraso && a.atrasoDesde ? formatarDataSimples(a.atrasoDesde) : a.proximoVencimento ? formatarDataSimples(a.proximoVencimento) : '—'}
              </dd>
            </div>
            <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <dt className="flex items-center gap-1.5 text-white/60">
                <IconeForma className="h-4 w-4" aria-hidden="true" /> Pagamento
              </dt>
              <dd className="mt-1 font-semibold">{a.formaPagamento ? FORMA_ASSINATURA_ROTULOS[a.formaPagamento] : a.assinadaOnline ? 'Online' : 'Ainda não definido'}</dd>
            </div>
            <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <dt className="flex items-center gap-1.5 text-white/60">
                <Layers className="h-4 w-4" aria-hidden="true" /> Módulos
              </dt>
              <dd className="mt-1 font-semibold">{modulos.length} incluídos</dd>
            </div>
          </dl>

          {modulos.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Módulos incluídos">
              {modulos.map((m) => (
                <li key={m.codigo} className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/75 ring-1 ring-white/10">
                  {MODULO_ROTULOS[m.codigo as Modulo] ?? m.rotulo}
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="flex flex-col justify-between gap-6 rounded-2xl bg-white/[0.06] p-5 ring-1 ring-white/10 backdrop-blur">
          {noTeste ? (
            <Anel valor={a.acesso.diasRestantesTeste ?? 0} total={Math.max(a.plano.diasTeste, a.acesso.diasRestantesTeste ?? 0)} rotulo={`${a.acesso.diasRestantesTeste ?? 0}`} legenda={`${a.acesso.diasRestantesTeste === 1 ? 'dia' : 'dias'} de teste grátis`} />
          ) : (
            <div>
              <p className="text-sm text-white/60">Mensalidade</p>
              <p className="font-titulo text-3xl font-extrabold">{formatarMoeda(aberta?.valor ?? a.plano.valorMensal)}</p>
              <p className={cn('text-sm', emAtraso ? 'text-amber-200' : 'text-white/60')}>
                {aberta ? `${aberta.situacao === 'vencida' ? 'venceu' : 'vence'} em ${formatarDataSimples(aberta.vencimento)}` : emAtraso && a.atrasoDesde ? `vencida desde ${formatarDataSimples(a.atrasoDesde)}` : 'nenhuma em aberto'}
              </p>
            </div>
          )}
          <Medidor usado={a.usuariosAtivos} limite={a.plano.limiteUsuarios} />
          {aberta?.linkPagamento ? (
            <Button asChild size="lg" className="w-full">
              <a href={aberta.linkPagamento} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Pagar {formatarMoeda(aberta.valor)}
              </a>
            </Button>
          ) : !a.assinadaOnline && a.pagamentoOnline && a.podeGerenciar ? (
            <Button size="lg" className="w-full" onClick={onAssinar}>
              <Sparkles /> {textoAssinar}
            </Button>
          ) : null}
        </aside>
      </div>
    </section>
  )
}
