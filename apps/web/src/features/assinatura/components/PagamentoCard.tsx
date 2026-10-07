import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CreditCard, ExternalLink, RefreshCw, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { FORMA_ASSINATURA_ROTULOS, formatarDataSimples, formatarMoeda, type FormaAssinatura, type MinhaAssinatura } from '@onprint/shared'
import { assinaturaApi } from '@/api/assinatura'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/form-controls'
import { cn } from '@/lib/utils'

type Acao = 'plano' | 'forma' | 'cancelar' | null

/** Assinatura já no pagamento online: pagar a cobrança em aberto, trocar plano/forma e cancelar. */
export function PagamentoCard({ a }: { a: MinhaAssinatura }) {
  const queryClient = useQueryClient()
  const [acao, setAcao] = useState<Acao>(null)
  const [plano, setPlano] = useState(a.plano.codigo)
  const [forma, setForma] = useState<FormaAssinatura>(a.formaPagamento ?? 'pix_boleto')
  const aberta = a.cobrancaAberta
  const vencida = aberta?.situacao === 'vencida'
  const atualizar = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['assinatura'] })])
  const escolhido = a.planos.find((p) => p.codigo === plano)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pagamento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {aberta ? (
          <div className={cn('flex flex-wrap items-center gap-3 rounded-xl border p-4', vencida ? 'border-coral/40 bg-coral/10' : 'border-border bg-fundo')}>
            {vencida && <AlertTriangle className="h-5 w-5 shrink-0 text-coral-escuro" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              <p className={cn('font-semibold', vencida ? 'text-coral-escuro' : 'text-grafite')}>
                {formatarMoeda(aberta.valor)} · {vencida ? 'venceu' : 'vence'} em {formatarDataSimples(aberta.vencimento)}
              </p>
              {aberta.falha && <p className="text-xs text-coral-escuro">{aberta.falha}. Tente outro cartão ou pague por PIX na mesma página.</p>}
            </div>
            {aberta.linkPagamento && (
              <Button asChild>
                <a href={aberta.linkPagamento} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Pagar agora
                </a>
              </Button>
            )}
          </div>
        ) : (
          <p className="text-texto-secundario">Nenhuma mensalidade em aberto.{a.proximoVencimento ? ` A próxima vence em ${formatarDataSimples(a.proximoVencimento)}.` : ''}</p>
        )}

        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-texto-secundario">Forma de pagamento</dt>
            <dd className="font-medium text-grafite">{a.formaPagamento ? FORMA_ASSINATURA_ROTULOS[a.formaPagamento] : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-texto-secundario">Mensalidade</dt>
            <dd className="font-medium text-grafite">
              {formatarMoeda(a.plano.valorMensal)} (plano {a.plano.nome})
            </dd>
          </div>
        </dl>

        {a.podeGerenciar && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => setAcao('plano')}>
              <RefreshCw /> Trocar plano
            </Button>
            <Button variant="outline" onClick={() => setAcao('forma')}>
              <CreditCard /> Forma de pagamento
            </Button>
            <Button variant="ghost" className="text-coral-escuro hover:text-coral-escuro" onClick={() => setAcao('cancelar')}>
              <XCircle /> Cancelar assinatura
            </Button>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        aberto={acao === 'plano'}
        onAbertoChange={(x) => !x && setAcao(null)}
        titulo="Trocar de plano"
        descricao={
          <span className="block space-y-3">
            <Select aria-label="Plano" value={plano} onChange={(e) => setPlano(e.target.value)}>
              {a.planos.map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.nome} · {formatarMoeda(p.valorMensal)}/mês · {p.limiteUsuarios ? `até ${p.limiteUsuarios} usuários` : 'usuários ilimitados'}
                </option>
              ))}
            </Select>
            <span className="block text-xs">Os módulos mudam na hora. A mensalidade em aberto e as próximas passam a ter o valor do plano novo.</span>
          </span>
        }
        textoConfirmar={escolhido ? `Mudar para ${escolhido.nome}` : 'Mudar'}
        onConfirmar={async () => {
          await assinaturaApi.trocarPlano(plano)
          toast.success('Plano alterado.')
          await atualizar()
        }}
      />
      <ConfirmDialog
        aberto={acao === 'forma'}
        onAbertoChange={(x) => !x && setAcao(null)}
        titulo="Forma de pagamento"
        descricao={
          <Select aria-label="Forma de pagamento" value={forma} onChange={(e) => setForma(e.target.value as FormaAssinatura)}>
            {(Object.keys(FORMA_ASSINATURA_ROTULOS) as FormaAssinatura[]).map((f) => (
              <option key={f} value={f}>
                {FORMA_ASSINATURA_ROTULOS[f]}
              </option>
            ))}
          </Select>
        }
        textoConfirmar="Salvar"
        onConfirmar={async () => {
          await assinaturaApi.trocarForma(forma)
          toast.success('Forma de pagamento alterada.')
          await atualizar()
        }}
      />
      <ConfirmDialog
        aberto={acao === 'cancelar'}
        onAbertoChange={(x) => !x && setAcao(null)}
        titulo="Cancelar a assinatura?"
        descricao={`As cobranças param. O sistema continua funcionando ${a.situacao === 'teste' ? 'até o fim do teste grátis' : 'até o fim do período já pago'}; depois, fica bloqueado. Os dados ficam guardados e você pode assinar de novo quando quiser.`}
        textoConfirmar="Cancelar assinatura"
        perigoso
        onConfirmar={async () => {
          const r = await assinaturaApi.cancelar()
          toast.success(`Assinatura cancelada. Acesso até ${formatarDataSimples(r.cancelarEm)}.`)
          await atualizar()
        }}
      />
    </Card>
  )
}
