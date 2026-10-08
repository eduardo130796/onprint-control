import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarClock, Layers, Lock, ShieldCheck, Users, Wallet } from 'lucide-react'
import { MODULO_ROTULOS, formatarData, formatarDataSimples, formatarMoeda, type EmpresaPlataformaDetalhe, type Modulo } from '@onprint/shared'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Skeleton } from '@/components/ui/skeleton'
import { mascaraCpfCnpj } from '@/lib/mascaras'
import { cn } from '@/lib/utils'
import { plataformaApi } from '../api'
import { CATEGORIA_SINGULAR, FORMA_CURTA, PILULA_ESCURA, PONTO_CATEGORIA } from '../components/cores'
import type { PedidoAcao } from '../components/acoes'
import { DialogoAcao } from '../components/DialogoAcao'
import { AcoesFicha, BeneficiosFicha, CobrancasFicha, LinhaDoTempo } from '../components/FichaAssinatura'
import { Secao } from '../components/Secao'
import { detalheSituacao } from '../components/regras'
import { ValorCobrado } from '../components/Valores'

function Bloco({ rotulo, icone: Icone, children, destaque }: { rotulo: string; icone: typeof Wallet; children: React.ReactNode; destaque?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <dt className="flex items-center gap-1.5 text-xs text-white/60">
        <Icone className="h-3.5 w-3.5" aria-hidden="true" /> {rotulo}
      </dt>
      <dd className={cn('mt-1 font-semibold', destaque && 'text-amber-200')}>{children}</dd>
    </div>
  )
}

/** Cartão escuro do topo: plano, valor, situação, vencimento e forma de pagamento. */
function HeroFicha({ e }: { e: EmpresaPlataformaDetalhe }) {
  const a = e.assinatura
  const cat = e.categoria
  // Na pílula só o detalhe curto (dias de atraso / fim do teste); a mensagem completa vai logo abaixo
  const detalhe = e.diasAtraso > 0 || e.categoria === 'teste' ? detalheSituacao(e) : null
  const forma = a?.formaPagamento ? FORMA_CURTA[a.formaPagamento] : undefined
  const emAtraso = Number(e.emAtraso) > 0
  const vencimento =
    e.categoria === 'teste' && e.testeAte
      ? { rotulo: 'Teste até', valor: formatarDataSimples(e.testeAte), alerta: false }
      : a?.atrasoDesde && e.diasAtraso > 0
        ? { rotulo: 'Em atraso desde', valor: formatarDataSimples(a.atrasoDesde), alerta: true }
        : a?.cortesia
          ? { rotulo: 'Cortesia', valor: a.cortesia.ate ? `até ${formatarDataSimples(a.cortesia.ate)}` : 'sem prazo', alerta: false }
          : { rotulo: 'Próximo vencimento', valor: e.proximoVencimento ? formatarDataSimples(e.proximoVencimento) : '—', alerta: false }

  return (
    <section className="relative overflow-hidden rounded-3xl bg-grafite text-white shadow-xl" aria-label="Assinatura da empresa">
      <div className="pointer-events-none absolute -right-28 -top-32 h-80 w-80 rounded-full bg-marca/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-36 left-1/3 h-72 w-72 rounded-full bg-laranja/10 blur-3xl" aria-hidden="true" />
      <div className="flex h-1.5" aria-hidden="true">
        <span className="w-16 bg-laranja" />
        <span className={cn('flex-1', cat ? PONTO_CATEGORIA[cat] : 'bg-marca')} />
      </div>

      <div className="relative grid gap-6 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Assinatura</p>
          <h1 className="mt-1 break-words font-titulo text-3xl font-extrabold tracking-tight sm:text-4xl">{e.nome}</h1>
          <p className="mt-1 break-all text-sm text-white/60">
            /{e.slug} · desde {formatarData(e.criadaEm)}
            {e.email && ` · ${e.email}`}
            {e.cnpj && ` · ${mascaraCpfCnpj(e.cnpj)}`}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {cat && (
              <span className={cn('inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-bold ring-1', PILULA_ESCURA[cat])}>
                <span className={cn('h-2 w-2 rounded-full', PONTO_CATEGORIA[cat])} aria-hidden="true" />
                {CATEGORIA_SINGULAR[cat]}
                {detalhe && <span className="font-medium opacity-80">· {detalhe}</span>}
              </span>
            )}
            {a?.planoAgendado && (
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 ring-1 ring-white/15">
                Muda para {a.planoAgendado.nome} em {formatarDataSimples(a.planoAgendado.em)}
              </span>
            )}
            {a?.cancelarEm && e.situacao !== 'cancelada' && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 ring-1 ring-white/15">Cancelamento em {formatarDataSimples(a.cancelarEm)}</span>}
          </div>
          {a && !['em_dia', 'teste'].includes(a.acesso.motivo) && !detalhe && <p className="mt-3 max-w-2xl text-sm text-white/70">{a.acesso.mensagem}</p>}

          <dl className="mt-6 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <Bloco rotulo="Plano" icone={Layers}>
              {e.plano ?? '—'}
            </Bloco>
            <Bloco rotulo="Cobrado por mês" icone={Wallet}>
              <ValorCobrado e={e} claro />
            </Bloco>
            <Bloco rotulo={vencimento.rotulo} icone={CalendarClock} destaque={vencimento.alerta}>
              {vencimento.valor}
            </Bloco>
            <Bloco rotulo="Pagamento" icone={forma?.Icone ?? Wallet}>
              {forma ? forma.rotulo : a?.gatewayAssinaturaId ? 'Asaas' : 'Manual'}
            </Bloco>
          </dl>
        </div>

        <aside className="flex min-w-0 flex-col gap-5 rounded-2xl bg-white/[0.06] p-5 ring-1 ring-white/10 backdrop-blur">
          <div>
            <p className="text-sm text-white/60">{emAtraso ? 'Em atraso' : 'Último pagamento'}</p>
            <p className={cn('font-titulo text-3xl font-extrabold tabular-nums', emAtraso && 'text-red-200')}>{emAtraso ? formatarMoeda(e.emAtraso) : e.ultimoPagamento ? formatarMoeda(e.ultimoPagamento.valor) : '—'}</p>
            <p className="text-sm text-white/60">{emAtraso ? `${e.diasAtraso} ${e.diasAtraso === 1 ? 'dia' : 'dias'} de atraso` : e.ultimoPagamento ? `em ${formatarData(e.ultimoPagamento.data)}` : 'nenhum pagamento ainda'}</p>
          </div>
          <div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="inline-flex items-center gap-1.5 text-white/70">
                <Users className="h-4 w-4" aria-hidden="true" /> Usuários ativos
              </span>
              <span className="font-semibold">
                {e.usuarios.ativos}
                <span className="text-white/50"> / {a?.limiteUsuarios ?? '∞'}</span>
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-marca" style={{ width: a?.limiteUsuarios ? `${Math.min(100, Math.round((e.usuarios.ativos / a.limiteUsuarios) * 100))}%` : '12%' }} />
            </div>
          </div>
          {a && (a.gatewayClienteId || a.gatewayAssinaturaId || a.documentoCobranca) && (
            <dl className="space-y-1 border-t border-white/10 pt-4 font-mono text-[11px] text-white/50">
              {a.gatewayClienteId && (
                <div className="flex justify-between gap-2">
                  <dt>cliente</dt>
                  <dd className="truncate">{a.gatewayClienteId}</dd>
                </div>
              )}
              {a.gatewayAssinaturaId && (
                <div className="flex justify-between gap-2">
                  <dt>assinatura</dt>
                  <dd className="truncate">{a.gatewayAssinaturaId}</dd>
                </div>
              )}
              {a.documentoCobranca && (
                <div className="flex justify-between gap-2">
                  <dt>documento</dt>
                  <dd className="truncate">{mascaraCpfCnpj(a.documentoCobranca)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt>schema</dt>
                <dd className="truncate">{e.schema}</dd>
              </div>
            </dl>
          )}
        </aside>
      </div>
    </section>
  )
}

/** Ficha da empresa no painel: assinatura em destaque, benefícios, ações, cobranças e linha do tempo. */
export function EmpresaPlataformaPage() {
  const { id = '' } = useParams()
  const consulta = useQuery({ queryKey: ['plataforma', 'empresa', id], queryFn: () => plataformaApi.empresa(id) })
  const [pedido, setPedido] = useState<PedidoAcao | null>(null)
  const e = consulta.data
  const a = e?.assinatura

  return (
    <>
      <Link to="/plataforma/empresas" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-marca-escuro hover:underline">
        <ArrowLeft className="h-4 w-4" /> Assinaturas
      </Link>
      {consulta.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-72 w-full rounded-3xl" />
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
      ) : consulta.isError || !e ? (
        <Secao>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Secao>
      ) : (
        <div className="space-y-5">
          <HeroFicha e={e} />

          {a?.bloqueioManual && (
            <div className="flex items-start gap-3 rounded-2xl bg-red-50 p-4 text-sm ring-1 ring-red-200">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
              <p className="text-red-900">
                <strong>Bloqueada pelo suporte.</strong> {a.motivoBloqueio}
              </p>
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-5">
              {/* No celular os benefícios vêm logo depois do cartão principal */}
              <div className="xl:hidden">
                <BeneficiosFicha empresa={e} onPedir={setPedido} />
              </div>
              <AcoesFicha empresa={e} onPedir={setPedido} />
              <CobrancasFicha empresa={e} onPedir={setPedido} />
              <LinhaDoTempo empresa={e} />
            </div>
            <div className="min-w-0 space-y-5">
              <div className="hidden xl:block">
                <BeneficiosFicha empresa={e} onPedir={setPedido} />
              </div>
              <Secao titulo="Administradores" subtitulo={`${e.usuarios.ativos} ativo(s) de ${e.usuarios.total} usuário(s).`} icone={ShieldCheck}>
                <ul className="space-y-3 text-sm">
                  {e.usuarios.admins.map((u) => (
                    <li key={u.email} className="min-w-0">
                      <p className="truncate font-semibold text-grafite">{u.nome}</p>
                      <p className="truncate text-xs text-texto-secundario">{u.email}</p>
                      <p className="text-xs text-texto-secundario">{u.ultimoLogin ? `Último acesso ${formatarData(u.ultimoLogin)}` : 'Nunca entrou'}</p>
                    </li>
                  ))}
                </ul>
              </Secao>
              {a && (
                <Secao titulo="Módulos" subtitulo={a.modulosExtras.length ? `${a.modulosExtras.length} extra(s) além do plano.` : 'Os do plano.'} icone={Layers}>
                  <ul className="flex flex-wrap gap-1.5">
                    {a.modulos.map((m) => (
                      <li key={m} className={cn('rounded-full px-2.5 py-1 text-xs font-medium ring-1', a.modulosExtras.includes(m) ? 'bg-marca-suave text-marca-escuro ring-marca/30' : 'bg-fundo text-grafite ring-border')}>
                        {MODULO_ROTULOS[m as Modulo] ?? m}
                      </li>
                    ))}
                  </ul>
                </Secao>
              )}
            </div>
          </div>
        </div>
      )}
      {pedido && <DialogoAcao pedido={pedido} onFechar={() => setPedido(null)} />}
    </>
  )
}
