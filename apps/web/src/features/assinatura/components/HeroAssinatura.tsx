import { CalendarClock, CreditCard, ExternalLink, Gift, Layers, QrCode, Receipt, Sparkles, TicketPercent, Users } from 'lucide-react'
import { FORMA_ASSINATURA_ROTULOS, MODULO_ROTULOS, formatarDataSimples, formatarMoeda, type MinhaAssinatura, type Modulo } from '@onprint/shared'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { statusDaAssinatura, type TomStatus } from '../status'

const TOM: Record<TomStatus, { ponto: string; pilula: string }> = {
  verde: { ponto: 'bg-marca', pilula: 'bg-marca/15 text-marca ring-marca/30' },
  azul: { ponto: 'bg-sky-400', pilula: 'bg-sky-400/15 text-sky-200 ring-sky-300/30' },
  violeta: { ponto: 'bg-violet-400', pilula: 'bg-violet-400/15 text-violet-200 ring-violet-300/30' },
  ambar: { ponto: 'bg-amber-400', pilula: 'bg-amber-400/15 text-amber-200 ring-amber-300/30' },
  coral: { ponto: 'bg-coral', pilula: 'bg-coral/20 text-red-200 ring-coral/40' },
  vermelho: { ponto: 'bg-red-500', pilula: 'bg-red-500/20 text-red-200 ring-red-400/40' },
  cinza: { ponto: 'bg-white/50', pilula: 'bg-white/10 text-white/80 ring-white/20' },
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
  const status = statusDaAssinatura(a.acesso, { situacao: a.situacao, cancelarEm: a.cancelarEm })
  const tom = TOM[status.tom]
  const aberta = a.cobrancaAberta
  const cortesia = a.acesso.motivo === 'cortesia'
  const noTeste = a.acesso.diasRestantesTeste !== null && !cortesia
  const comDesconto = a.cupom && Number(a.cupom.desconto) > 0 ? (Number(a.plano.valorMensal) - Number(a.cupom.desconto)).toFixed(2) : null
  const IconeForma = a.formaPagamento ? ICONE_FORMA[a.formaPagamento] : CreditCard
  const modulos = a.modulos.filter((m) => m.incluido)
  const emAtraso = a.acesso.diasAtraso > 0 && Boolean(a.atrasoDesde)
  const textoAssinar = a.situacao === 'teste' || a.situacao === 'cortesia' ? 'Assinar agora' : a.situacao === 'cancelada' ? 'Assinar de novo' : 'Regularizar agora'

  return (
    <section className="relative overflow-hidden rounded-3xl bg-grafite text-white shadow-xl" aria-label="Sua assinatura">
      <div className="pointer-events-none absolute -right-28 -top-32 h-80 w-80 rounded-full bg-marca/25 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-36 left-1/3 h-72 w-72 rounded-full bg-laranja/10 blur-3xl" aria-hidden="true" />
      <div className="flex h-1.5" aria-hidden="true">
        <span className="w-16 bg-laranja" />
        <span className="flex-1 bg-marca" />
      </div>

      <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Seu plano</p>
          <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
            <h2 className="font-titulo text-4xl font-extrabold tracking-tight sm:text-5xl">{a.plano.nome}</h2>
            {cortesia ? (
              <p className="pb-1 text-white/80">
                <span className="font-titulo text-2xl font-extrabold text-violet-200">Cortesia</span>
                <span className="ml-2 text-sm text-white/50 line-through">{formatarMoeda(a.plano.valorMensal)}/mês</span>
              </p>
            ) : (
              <p className="pb-1 text-white/80">
                <span className="font-titulo text-2xl font-extrabold text-white">{formatarMoeda(comDesconto ?? a.plano.valorMensal)}</span>
                <span className="text-sm">/mês</span>
                {comDesconto && <span className="ml-2 text-sm text-white/50 line-through">{formatarMoeda(a.plano.valorMensal)}</span>}
              </p>
            )}
          </div>
          {a.cupom && !cortesia && (
            <p className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-xl bg-marca/10 px-3 py-1.5 text-sm text-white/85 ring-1 ring-marca/25">
              <TicketPercent className="h-4 w-4 text-marca" aria-hidden="true" />
              <span>
                Cupom <strong className="font-mono tracking-wide text-white">{a.cupom.codigo}</strong>: {a.cupom.descricao}
                {a.cupom.ate ? ` (até a mensalidade de ${formatarDataSimples(a.cupom.ate)})` : ''}
              </span>
            </p>
          )}

          {/* A situação (e a mensagem) fica no cabeçalho do topo; aqui, só o selo */}
          <span className={cn('mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ring-1', tom.pilula)}>
            <span className={cn('h-2 w-2 rounded-full', tom.ponto)} aria-hidden="true" />
            {status.rotulo}
          </span>
          {cortesia && a.cortesia?.motivo && <p className="mt-3 max-w-xl text-sm text-white/70">Oferecida pelo suporte: {a.cortesia.motivo}.</p>}

          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
            <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <dt className="flex items-center gap-1.5 text-white/60">
                <CalendarClock className="h-4 w-4" aria-hidden="true" /> {cortesia ? 'Cortesia até' : noTeste ? 'Teste até' : emAtraso ? 'Em atraso desde' : 'Próxima cobrança'}
              </dt>
              <dd className={cn('mt-1 font-semibold', emAtraso && !cortesia && 'text-amber-200')}>
                {cortesia
                  ? a.cortesia?.ate
                    ? formatarDataSimples(a.cortesia.ate)
                    : 'Sem prazo'
                  : noTeste && a.testeAte
                    ? formatarDataSimples(a.testeAte)
                    : emAtraso && a.atrasoDesde
                      ? formatarDataSimples(a.atrasoDesde)
                      : a.proximoVencimento
                        ? formatarDataSimples(a.proximoVencimento)
                        : '—'}
              </dd>
            </div>
            <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <dt className="flex items-center gap-1.5 text-white/60">
                <IconeForma className="h-4 w-4" aria-hidden="true" /> Pagamento
              </dt>
              <dd className="mt-1 font-semibold">{a.formaPagamento ? FORMA_ASSINATURA_ROTULOS[a.formaPagamento] : a.assinadaOnline ? 'Online' : cortesia ? 'Sem mensalidade' : 'Ainda não definido'}</dd>
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
          {cortesia && a.acesso.diasRestantesTeste === null ? (
            <div className="flex items-center gap-4">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-violet-400/15 ring-1 ring-violet-300/30">
                <Gift className="h-9 w-9 text-violet-200" aria-hidden="true" />
              </span>
              <div>
                <p className="font-titulo text-2xl font-extrabold leading-tight">Sem mensalidade</p>
                <p className="mt-1 text-sm text-white/60">Assinatura cortesia, sem prazo</p>
              </div>
            </div>
          ) : cortesia ? (
            <Anel valor={a.acesso.diasRestantesTeste ?? 0} total={Math.max(30, a.acesso.diasRestantesTeste ?? 0)} rotulo={`${a.acesso.diasRestantesTeste ?? 0}`} legenda={`${a.acesso.diasRestantesTeste === 1 ? 'dia' : 'dias'} de cortesia`} />
          ) : noTeste ? (
            <Anel valor={a.acesso.diasRestantesTeste ?? 0} total={Math.max(a.plano.diasTeste, a.acesso.diasRestantesTeste ?? 0)} rotulo={`${a.acesso.diasRestantesTeste ?? 0}`} legenda={`${a.acesso.diasRestantesTeste === 1 ? 'dia' : 'dias'} de teste grátis`} />
          ) : (
            <div>
              <p className="text-sm text-white/60">{a.cobrancasAbertas.length > 1 ? `Em aberto (${a.cobrancasAbertas.length} cobranças)` : 'Mensalidade'}</p>
              <p className="font-titulo text-3xl font-extrabold">
                {formatarMoeda(a.cobrancasAbertas.length > 1 ? a.cobrancasAbertas.reduce((t, c) => t + Number(c.valor), 0).toFixed(2) : (aberta?.valor ?? comDesconto ?? a.plano.valorMensal))}
              </p>
              <p className={cn('text-sm', emAtraso ? 'text-amber-200' : 'text-white/60')}>
                {aberta ? `${aberta.situacao === 'vencida' ? 'venceu' : 'vence'} em ${formatarDataSimples(aberta.vencimento)}` : emAtraso && a.atrasoDesde ? `vencida desde ${formatarDataSimples(a.atrasoDesde)}` : 'nenhuma em aberto'}
              </p>
            </div>
          )}
          <Medidor usado={a.usuariosAtivos} limite={a.plano.limiteUsuarios} />
          {a.cobrancasAbertas.length > 1 ? (
            // Cada cobrança tem a própria página de pagamento: leva à lista
            <Button asChild size="lg" className="w-full">
              <a href="#cobrancas-abertas">
                <ExternalLink /> Pagar {formatarMoeda(a.cobrancasAbertas.reduce((t, c) => t + Number(c.valor), 0).toFixed(2))} ({a.cobrancasAbertas.length} cobranças)
              </a>
            </Button>
          ) : aberta?.linkPagamento ? (
            <Button asChild size="lg" className="w-full">
              <a href={aberta.linkPagamento} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Pagar {formatarMoeda(aberta.valor)}
              </a>
            </Button>
          ) : !a.assinadaOnline && a.pagamentoOnline && a.podeGerenciar && !(cortesia && a.acesso.diasRestantesTeste === null) ? (
            <Button size="lg" className="w-full" onClick={onAssinar}>
              <Sparkles /> {textoAssinar}
            </Button>
          ) : null}
        </aside>
      </div>
    </section>
  )
}
