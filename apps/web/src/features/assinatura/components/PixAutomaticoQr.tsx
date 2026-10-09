import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Loader2, RefreshCw, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { formatarData, formatarMoeda, type MinhaAssinatura } from '@onprint/shared'
import { assinaturaApi } from '@/api/assinatura'
import { Button } from '@/components/ui/button'

const PASSOS = ['Abra o app do seu banco e escolha pagar com PIX (QR Code ou copia e cola).', 'Confira o valor da 1ª mensalidade e confirme o PIX Automático.', 'Pronto: as próximas mensalidades são debitadas sozinhas, todo mês.']

/** PIX Automático aguardando: QR Code da 1ª mensalidade, que também registra a autorização no banco. */
export function PixAutomaticoQr({ a }: { a: MinhaAssinatura }) {
  const queryClient = useQueryClient()
  const [copiado, setCopiado] = useState(false)
  const pix = a.pixAutomatico
  const novo = useMutation({
    mutationFn: assinaturaApi.novoQrPix,
    onSuccess: async () => {
      toast.success('QR Code novo gerado.')
      await queryClient.invalidateQueries({ queryKey: ['assinatura'] })
    },
    onError: (e) => toast.error((e as Error).message),
  })
  if (!pix) return null
  const expirado = pix.expiraEm ? new Date(pix.expiraEm) < new Date() : false

  async function copiar() {
    try {
      await navigator.clipboard.writeText(pix?.copiaECola ?? '')
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      toast.error('Não deu para copiar. Selecione o código e copie manualmente.')
    }
  }

  return (
    <section className="overflow-hidden rounded-3xl bg-card shadow-suave" aria-label="Autorizar PIX Automático">
      <div className="grid gap-0 md:grid-cols-[300px_1fr]">
        <div className="flex flex-col items-center justify-center gap-3 bg-marca-suave p-6">
          {pix.imagem && !expirado ? (
            <img src={`data:image/png;base64,${pix.imagem}`} alt="QR Code do PIX Automático" className="h-56 w-56 rounded-2xl bg-white p-3 shadow-lg" />
          ) : (
            <div className="flex h-56 w-56 items-center justify-center rounded-2xl bg-white p-6 text-center text-sm text-texto-secundario shadow">{expirado ? 'Este QR Code expirou.' : 'Use o código copia e cola ao lado.'}</div>
          )}
          <p className="text-center font-titulo text-2xl font-extrabold text-tinta">{formatarMoeda(a.plano.valorMensal)}</p>
          {pix.expiraEm && <p className="text-xs text-texto-secundario">{expirado ? 'Expirou' : 'Vale até'} {formatarData(pix.expiraEm)}</p>}
        </div>

        <div className="min-w-0 p-6 sm:p-8">
          <p className="inline-flex items-center gap-2 rounded-full bg-grafite px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-marca" aria-hidden="true" /> Aguardando autorização
          </p>
          <h3 className="mt-3 font-titulo text-2xl font-extrabold text-tinta">Autorize o PIX Automático</h3>
          <p className="mt-1 text-sm text-texto-secundario">Um pagamento só: paga a 1ª mensalidade e autoriza as próximas. Esta tela atualiza sozinha quando o banco confirmar.</p>

          <ol className="mt-5 space-y-3">
            {PASSOS.map((p, i) => (
              <li key={p} className="flex gap-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fundo text-xs font-bold text-tinta">{i + 1}</span>
                <span>{p}</span>
              </li>
            ))}
          </ol>

          <div className="mt-6">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-texto-secundario">
              <Smartphone className="h-3.5 w-3.5" aria-hidden="true" /> PIX copia e cola
            </p>
            <div className="mt-2 flex gap-2">
              <code className="block min-w-0 flex-1 truncate rounded-xl bg-fundo px-3 py-2.5 font-mono text-xs text-tinta">{pix.copiaECola}</code>
              <Button type="button" onClick={() => void copiar()} disabled={expirado}>
                {copiado ? <Check /> : <Copy />} {copiado ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
          </div>

          {a.podeGerenciar && (
            <Button variant="ghost" className="mt-4" disabled={novo.isPending} onClick={() => novo.mutate()}>
              {novo.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Gerar outro QR Code
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
