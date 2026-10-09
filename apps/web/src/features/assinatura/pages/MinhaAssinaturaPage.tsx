import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarX, MessageCircle, ShieldCheck } from 'lucide-react'
import { formatarDataSimples } from '@onprint/shared'
import { assinaturaApi } from '@/api/assinatura'
import { PageHeader } from '@/components/layout/PageHeader'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { CabecalhoStatus } from '../components/CabecalhoStatus'
import { CartoesPlanos } from '../components/CartoesPlanos'
import { EscolherAssinatura } from '../components/EscolherAssinatura'
import { GerenciarAssinatura } from '../components/GerenciarAssinatura'
import { HeroAssinatura } from '../components/HeroAssinatura'
import { HistoricoCobrancas } from '../components/HistoricoCobrancas'
import { LinhaDoTempoAtraso } from '../components/LinhaDoTempoAtraso'
import { PixAutomaticoQr } from '../components/PixAutomaticoQr'

/**
 * "Minha assinatura": plano e situação em destaque, o que fazer agora (pagar, assinar, autorizar o PIX),
 * gestão da assinatura e mensalidades. Funciona mesmo com o sistema bloqueado.
 */
export function MinhaAssinaturaPage() {
  const { usuario } = useAuth()
  const assinar = useRef<HTMLElement>(null)
  const consulta = useQuery({
    queryKey: ['assinatura'],
    queryFn: assinaturaApi.obter,
    // Aguardando a autorização do PIX Automático: confere a cada 10 s (a tela muda sozinha quando o banco confirmar)
    refetchInterval: (q) => (q.state.data?.pixAutomatico ? 10_000 : false),
  })
  const a = consulta.data
  const emAtraso = a && ['atraso', 'teste_expirado', 'cortesia_encerrada'].includes(a.acesso.motivo)
  // Cortesia sem prazo não tem o que assinar
  const cortesiaFixa = a?.cortesia && !a.cortesia.ate
  const irParaAssinar = () => assinar.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <>
      <PageHeader titulo="Minha assinatura" subtitulo={usuario?.empresa.nome} />
      {consulta.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-80 w-full rounded-3xl" />
          <Skeleton className="h-48 w-full rounded-3xl" />
        </div>
      ) : consulta.isError || !a ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <div className="space-y-6">
          <CabecalhoStatus a={a} onAssinar={irParaAssinar} />

          <HeroAssinatura a={a} onAssinar={irParaAssinar} />

          {emAtraso && <LinhaDoTempoAtraso a={a} />}

          {a.cancelarEm && (
            <div className="flex flex-wrap items-center gap-4 rounded-3xl bg-card p-6 shadow-suave">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-fundo">
                <CalendarX className="h-6 w-6 text-tinta" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-titulo text-lg font-extrabold text-tinta">Assinatura cancelada</p>
                <p className="text-sm text-texto-secundario">O sistema funciona normalmente até {formatarDataSimples(a.cancelarEm)}. Mudou de ideia? É só assinar de novo abaixo.</p>
              </div>
            </div>
          )}

          {a.pixAutomatico && <PixAutomaticoQr a={a} />}

          {a.assinadaOnline && !a.pixAutomatico && <GerenciarAssinatura a={a} />}

          {!a.assinadaOnline &&
            !cortesiaFixa &&
            (a.pagamentoOnline && a.podeGerenciar ? (
              <EscolherAssinatura ref={assinar} a={a} />
            ) : (
              <section className="space-y-4">
                <h2 className="font-titulo text-xl font-extrabold text-tinta">Planos</h2>
                <CartoesPlanos planos={a.planos} />
              </section>
            ))}

          <HistoricoCobrancas cobrancas={a.cobrancas} />

          {!emAtraso && !cortesiaFixa && <LinhaDoTempoAtraso a={a} informativo />}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-3xl bg-card p-6 text-sm shadow-suave">
            <span className="inline-flex items-center gap-2 text-texto-secundario">
              <ShieldCheck className="h-5 w-5 text-marca-escuro" aria-hidden="true" /> Seus dados ficam guardados mesmo se a assinatura parar.
            </span>
            {(a.suporte || !a.pagamentoOnline || !a.podeGerenciar) && (
              <span className="inline-flex items-center gap-2 text-texto-secundario">
                <MessageCircle className="h-5 w-5 text-marca-escuro" aria-hidden="true" />
                {!a.podeGerenciar ? 'Só o administrador da empresa assina, troca de plano ou cancela.' : !a.pagamentoOnline ? 'Para pagar ou mudar de plano, fale com o suporte' : 'Dúvidas sobre a assinatura? Fale com o suporte'}
                {a.suporte && (
                  <>
                    {' '}
                    <strong className="text-tinta">{a.suporte}</strong>
                  </>
                )}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  )
}
