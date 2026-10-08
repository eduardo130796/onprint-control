import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowUpRight, CreditCard, QrCode, Receipt, RefreshCw, XCircle, Zap } from 'lucide-react'
import { toast } from 'sonner'
import {
  FORMAS_AUTOMATICAS,
  FORMA_ASSINATURA_DETALHES,
  FORMA_ASSINATURA_ROTULOS,
  formatarDataSimples,
  formatarMoeda,
  type FormaAssinatura,
  type MinhaAssinatura,
} from '@onprint/shared'
import { assinaturaApi } from '@/api/assinatura'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { CartoesPlanos } from './CartoesPlanos'

const ICONE: Record<FormaAssinatura, typeof QrCode> = { pix_automatico: QrCode, cartao: CreditCard, pix_boleto: Receipt }

/** Quem já assina online: forma de pagamento, cobrança em aberto, troca de plano/forma e cancelamento. */
export function GerenciarAssinatura({ a }: { a: MinhaAssinatura }) {
  const queryClient = useQueryClient()
  const [dialogo, setDialogo] = useState<'plano' | 'forma' | 'cancelar' | null>(null)
  const [planoNovo, setPlanoNovo] = useState<string | null>(null)
  const [forma, setForma] = useState<FormaAssinatura | null>(null)
  const atualizar = () => queryClient.invalidateQueries({ queryKey: ['assinatura'] })
  const atual = a.formaPagamento
  const Icone = atual ? ICONE[atual] : CreditCard
  const automatica = atual ? FORMAS_AUTOMATICAS.includes(atual) : false
  const aberta = a.cobrancaAberta
  const destino = a.planos.find((p) => p.codigo === planoNovo)
  // Entre cartão e PIX/boleto troca na hora; PIX Automático é autorização no banco (cancela e assina de novo)
  const trocaveis = (['cartao', 'pix_boleto'] as FormaAssinatura[]).filter((f) => f !== atual)

  return (
    <section className="rounded-3xl bg-card p-6 shadow-suave sm:p-8" aria-label="Pagamento da assinatura">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className={cn('flex h-14 w-14 items-center justify-center rounded-2xl', automatica ? 'bg-marca text-grafite' : 'bg-fundo text-grafite')}>
            <Icone className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-texto-secundario">Forma de pagamento</p>
            <h3 className="font-titulo text-xl font-extrabold text-grafite">{atual ? FORMA_ASSINATURA_ROTULOS[atual] : 'Online'}</h3>
            <p className="text-sm text-texto-secundario">
              {automatica ? (
                <span className="inline-flex items-center gap-1 font-medium text-marca-escuro">
                  <Zap className="h-3.5 w-3.5" aria-hidden="true" /> {atual === 'pix_automatico' ? 'Débito automático pelo banco' : 'Cobrança automática no cartão'}
                </span>
              ) : (
                'Você recebe a cobrança e paga a cada mês'
              )}
              {a.proximoVencimento && ` · próxima em ${formatarDataSimples(a.proximoVencimento)}`}
            </p>
          </div>
        </div>
        {a.podeGerenciar && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDialogo('plano')}>
              <ArrowUpRight /> Trocar plano
            </Button>
            {atual !== 'pix_automatico' && (
              <Button variant="outline" onClick={() => setDialogo('forma')}>
                <RefreshCw /> Forma de pagamento
              </Button>
            )}
          </div>
        )}
      </div>

      {aberta && (
        <div className={cn('mt-6 flex flex-wrap items-center gap-4 rounded-2xl p-4 ring-1', aberta.situacao === 'vencida' ? 'bg-coral/10 ring-coral/30' : 'bg-fundo ring-border')}>
          {aberta.situacao === 'vencida' && <AlertTriangle className="h-5 w-5 shrink-0 text-coral-escuro" aria-hidden="true" />}
          <div className="min-w-0 flex-1">
            <p className={cn('font-semibold', aberta.situacao === 'vencida' ? 'text-coral-escuro' : 'text-grafite')}>
              Mensalidade de {formatarMoeda(aberta.valor)} {aberta.situacao === 'vencida' ? 'venceu' : 'vence'} em {formatarDataSimples(aberta.vencimento)}
            </p>
            {aberta.falha && <p className="text-sm text-coral-escuro">{aberta.falha}. Tente outro cartão ou pague por PIX na mesma página.</p>}
          </div>
          {aberta.linkPagamento && (
            <Button asChild>
              <a href={aberta.linkPagamento} target="_blank" rel="noopener noreferrer">
                Pagar agora
              </a>
            </Button>
          )}
        </div>
      )}

      {a.podeGerenciar && (
        <button type="button" onClick={() => setDialogo('cancelar')} className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-texto-secundario hover:text-coral-escuro">
          <XCircle className="h-4 w-4" aria-hidden="true" /> Cancelar assinatura
        </button>
      )}

      <Dialog open={dialogo === 'plano'} onOpenChange={(x) => !x && setDialogo(null)}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogTitle className="font-titulo text-2xl font-extrabold">Trocar de plano</DialogTitle>
          <DialogDescription>Os módulos mudam na hora. A mensalidade em aberto e as próximas passam a ter o valor do plano novo.</DialogDescription>
          <div className="mt-4">
            <CartoesPlanos planos={a.planos} acao="Mudar para este plano" onEscolher={(codigo) => setPlanoNovo(codigo)} />
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        aberto={Boolean(planoNovo)}
        onAbertoChange={(x) => !x && setPlanoNovo(null)}
        titulo={`Mudar para o plano ${destino?.nome ?? ''}?`}
        descricao={destino ? `A mensalidade passa a ser ${formatarMoeda(destino.valorMensal)}.` : ''}
        textoConfirmar="Confirmar troca"
        onConfirmar={async () => {
          await assinaturaApi.trocarPlano(planoNovo as string)
          toast.success(`Plano alterado para ${destino?.nome}.`)
          setDialogo(null)
          await atualizar()
        }}
      />

      <Dialog open={dialogo === 'forma'} onOpenChange={(x) => !x && setDialogo(null)}>
        <DialogContent className="max-w-xl">
          <DialogTitle className="font-titulo text-xl font-extrabold">Forma de pagamento</DialogTitle>
          <DialogDescription>A mensalidade em aberto e as próximas passam a usar a forma escolhida.</DialogDescription>
          <div className="mt-4 grid gap-3">
            {trocaveis.map((f) => {
              const I = ICONE[f]
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={forma === f}
                  onClick={() => setForma(f)}
                  className={cn('flex gap-4 rounded-2xl p-4 text-left ring-1', forma === f ? 'bg-marca-suave ring-2 ring-marca' : 'ring-border hover:bg-fundo')}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fundo">
                    <I className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-semibold text-grafite">{FORMA_ASSINATURA_ROTULOS[f]}</span>
                    <span className="block text-sm text-texto-secundario">{FORMA_ASSINATURA_DETALHES[f]}</span>
                  </span>
                </button>
              )
            })}
            {a.formasDisponiveis.includes('pix_automatico') && (
              <p className="text-xs text-texto-secundario">Quer o PIX Automático? Ele é uma autorização no seu banco: cancele a assinatura e assine de novo escolhendo PIX Automático.</p>
            )}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialogo(null)}>
              Voltar
            </Button>
            <Button
              disabled={!forma}
              onClick={async () => {
                try {
                  await assinaturaApi.trocarForma(forma as FormaAssinatura)
                  toast.success('Forma de pagamento alterada.')
                  setDialogo(null)
                  await atualizar()
                } catch (e) {
                  toast.error((e as Error).message)
                }
              }}
            >
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        aberto={dialogo === 'cancelar'}
        onAbertoChange={(x) => !x && setDialogo(null)}
        titulo="Cancelar a assinatura?"
        descricao={`As cobranças param${atual === 'pix_automatico' ? ' e a autorização do PIX Automático é encerrada no seu banco' : ''}. O sistema continua funcionando ${a.situacao === 'teste' ? 'até o fim do teste grátis' : 'até o fim do período já pago'}; depois, fica bloqueado. Os dados ficam guardados e você pode assinar de novo quando quiser.`}
        textoConfirmar="Cancelar assinatura"
        perigoso
        onConfirmar={async () => {
          const r = await assinaturaApi.cancelar()
          toast.success(`Assinatura cancelada. Acesso até ${formatarDataSimples(r.cancelarEm)}.`)
          await atualizar()
        }}
      />
    </section>
  )
}
