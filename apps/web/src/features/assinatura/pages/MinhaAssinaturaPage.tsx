import { useQuery } from '@tanstack/react-query'
import { Check, Clock, Eye, Lock, MessageCircle, ShieldCheck, Users } from 'lucide-react'
import { NIVEL_ACESSO_ROTULOS, SITUACAO_ASSINATURA_ROTULOS, formatarDataSimples, formatarMoeda, type MinhaAssinatura, type NivelAcesso } from '@onprint/shared'
import { http } from '@/api/http'
import { PageHeader } from '@/components/layout/PageHeader'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

const NIVEL: Record<NivelAcesso, { cor: string; Icone: typeof Check }> = {
  normal: { cor: 'bg-marca-suave text-grafite ring-marca/40', Icone: ShieldCheck },
  aviso: { cor: 'bg-amber-50 text-amber-900 ring-amber-300', Icone: Clock },
  somente_leitura: { cor: 'bg-coral/10 text-coral-escuro ring-coral/40', Icone: Eye },
  bloqueado: { cor: 'bg-grafite text-white ring-grafite', Icone: Lock },
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-texto-secundario">{rotulo}</dt>
      <dd className="font-medium text-grafite">{children}</dd>
    </div>
  )
}

/** Plano, situação (com o porquê), módulos e planos. Acessível mesmo com o sistema bloqueado. */
export function MinhaAssinaturaPage() {
  const { usuario } = useAuth()
  const consulta = useQuery({ queryKey: ['assinatura'], queryFn: () => http<MinhaAssinatura>('/assinatura') })
  const a = consulta.data

  return (
    <>
      <PageHeader titulo="Minha assinatura" subtitulo={usuario?.empresa.nome} />
      {consulta.isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : consulta.isError || !a ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-5 p-5">
              <div className={cn('flex flex-wrap items-center gap-3 rounded-xl p-4 ring-1', NIVEL[a.acesso.nivel].cor)}>
                {(() => {
                  const Icone = NIVEL[a.acesso.nivel].Icone
                  return <Icone className="h-6 w-6 shrink-0" aria-hidden="true" />
                })()}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Acesso: {NIVEL_ACESSO_ROTULOS[a.acesso.nivel]}</p>
                  <p className="text-base font-semibold">{a.acesso.mensagem}</p>
                </div>
              </div>

              <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Dado rotulo="Plano">
                  {a.plano.nome} · {formatarMoeda(a.plano.valorMensal)}/mês
                </Dado>
                <Dado rotulo="Situação">{SITUACAO_ASSINATURA_ROTULOS[a.situacao]}</Dado>
                {a.situacao === 'teste' && a.testeAte && <Dado rotulo="Teste grátis até">{formatarDataSimples(a.testeAte)}</Dado>}
                {a.proximoVencimento && <Dado rotulo="Próximo vencimento">{formatarDataSimples(a.proximoVencimento)}</Dado>}
                {a.atrasoDesde && <Dado rotulo="Em atraso desde">{formatarDataSimples(a.atrasoDesde)}</Dado>}
                {a.liberadoAte && <Dado rotulo="Liberado até">{formatarDataSimples(a.liberadoAte)}</Dado>}
                <Dado rotulo="Usuários ativos">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-4 w-4 text-texto-secundario" aria-hidden="true" />
                    {a.usuariosAtivos} {a.plano.limiteUsuarios ? `de ${a.plano.limiteUsuarios}` : '(sem limite)'}
                  </span>
                </Dado>
              </dl>

              <div className="rounded-xl bg-fundo p-4 text-sm text-texto-secundario">
                <p className="font-semibold text-grafite">Se a mensalidade atrasar</p>
                <ol className="mt-2 grid gap-2 sm:grid-cols-3">
                  <li>
                    <strong className="text-amber-900">Até {a.plano.diasAteSomenteLeitura - 1} dias:</strong> tudo funciona, com um aviso no topo.
                  </li>
                  <li>
                    <strong className="text-coral-escuro">A partir de {a.plano.diasAteSomenteLeitura} dias:</strong> só consulta e exportação; nada novo é gravado.
                  </li>
                  <li>
                    <strong className="text-grafite">A partir de {a.plano.diasAteBloqueio} dias:</strong> bloqueio, até o pagamento. Os dados ficam guardados.
                  </li>
                </ol>
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4 text-sm">
                <MessageCircle className="h-5 w-5 shrink-0 text-marca-escuro" aria-hidden="true" />
                <p className="min-w-0 flex-1">
                  Para pagar, mudar de plano ou tirar dúvidas, fale com o suporte{a.suporte ? ':' : '.'} {a.suporte && <strong className="text-grafite">{a.suporte}</strong>}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Módulos</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {a.modulos.map((m) => (
                  <li key={m.codigo} className={cn('flex items-start gap-2 rounded-lg border p-3', m.incluido ? 'border-marca/40' : 'border-border bg-fundo/60')}>
                    {m.incluido ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-marca-escuro" aria-hidden="true" /> : <Lock className="mt-0.5 h-4 w-4 shrink-0 text-texto-secundario" aria-hidden="true" />}
                    <span>
                      <span className={cn('font-medium', !m.incluido && 'text-texto-secundario')}>{m.rotulo}</span>
                      {!m.incluido && <span className="block text-xs text-texto-secundario">{m.planos.length ? `No plano ${m.planos.join(' ou ')}` : 'Em breve'}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            {a.planos.map((p) => (
              <Card key={p.codigo} className={cn('p-5', p.atual && 'ring-2 ring-marca')}>
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-titulo text-lg font-extrabold text-grafite">{p.nome}</h2>
                  {p.atual && <span className="rounded-full bg-marca px-2 py-0.5 text-[11px] font-bold text-grafite">Seu plano</span>}
                </div>
                <p className="mt-1 text-2xl font-extrabold text-grafite">
                  {formatarMoeda(p.valorMensal)}
                  <span className="text-sm font-medium text-texto-secundario">/mês</span>
                </p>
                <p className="mt-2 text-sm text-texto-secundario">{p.descricao}</p>
                <p className="mt-3 text-sm font-medium">{p.limiteUsuarios ? `Até ${p.limiteUsuarios} usuários` : 'Usuários ilimitados'}</p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
