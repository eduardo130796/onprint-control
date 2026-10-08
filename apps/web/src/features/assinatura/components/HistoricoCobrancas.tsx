import { CreditCard, FileText, QrCode, Receipt, Wallet } from 'lucide-react'
import { formatarDataSimples, formatarMoeda, type CobrancaResumo } from '@onprint/shared'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const SITUACAO: Record<CobrancaResumo['situacao'], { rotulo: string; ponto: string; texto: string }> = {
  pendente: { rotulo: 'Em aberto', ponto: 'bg-sky-500', texto: 'text-grafite' },
  vencida: { rotulo: 'Vencida', ponto: 'bg-coral', texto: 'text-coral-escuro' },
  paga: { rotulo: 'Paga', ponto: 'bg-marca', texto: 'text-marca-escuro' },
  cancelada: { rotulo: 'Cancelada', ponto: 'bg-slate-300', texto: 'text-texto-secundario' },
  estornada: { rotulo: 'Estornada', ponto: 'bg-amber-500', texto: 'text-amber-800' },
}
const FORMA: Record<string, { rotulo: string; Icone: typeof Wallet }> = {
  PIX: { rotulo: 'PIX', Icone: QrCode },
  BOLETO: { rotulo: 'Boleto', Icone: Receipt },
  CREDIT_CARD: { rotulo: 'Cartão', Icone: CreditCard },
  manual: { rotulo: 'Manual', Icone: Wallet },
}
const NOTA: Record<string, string> = { agendada: 'Nota em emissão', emitida: 'Nota fiscal', erro: 'Nota com erro', cancelada: 'Nota cancelada' }

/** Mensalidades (mais recentes primeiro): situação, como foi paga, nota fiscal e "Pagar" nas abertas. */
export function HistoricoCobrancas({ cobrancas }: { cobrancas: CobrancaResumo[] }) {
  if (cobrancas.length === 0) return null
  return (
    <section className="rounded-3xl bg-card p-6 shadow-suave sm:p-8" aria-label="Mensalidades">
      <h3 className="font-titulo text-lg font-extrabold text-grafite">Mensalidades</h3>
      <p className="text-sm text-texto-secundario">Pagamentos e notas fiscais da sua assinatura.</p>

      <div className="mt-5 hidden grid-cols-[110px_120px_130px_1fr_auto] gap-4 border-b border-border pb-2 text-xs font-semibold uppercase tracking-wide text-texto-secundario md:grid">
        <span>Vencimento</span>
        <span>Valor</span>
        <span>Situação</span>
        <span>Pagamento</span>
        <span className="text-right">Nota fiscal</span>
      </div>
      <ul className="divide-y divide-border">
        {cobrancas.map((c) => {
          const s = SITUACAO[c.situacao]
          const f = c.forma ? FORMA[c.forma] : undefined
          return (
            <li key={c.id} className="grid grid-cols-2 items-center gap-x-4 gap-y-1 py-3.5 text-sm md:grid-cols-[110px_120px_130px_1fr_auto]">
              <span className="font-medium tabular-nums text-grafite">{formatarDataSimples(c.vencimento)}</span>
              <span className="text-right font-semibold tabular-nums text-grafite md:text-left">{formatarMoeda(c.valor)}</span>
              <span className={cn('inline-flex items-center gap-2 font-medium', s.texto)}>
                <span className={cn('h-2 w-2 rounded-full', s.ponto)} aria-hidden="true" />
                {s.rotulo}
              </span>
              <span className="flex items-center justify-end gap-2 text-texto-secundario md:justify-start">
                {c.situacao === 'paga' && f && <f.Icone className="h-4 w-4" aria-hidden="true" />}
                {c.situacao === 'paga' ? `${f?.rotulo ?? c.forma ?? ''}${c.pagoEm ? ` · ${formatarDataSimples(c.pagoEm)}` : ''}` : (c.falha ?? '')}
              </span>
              <span className="col-span-2 flex items-center justify-end gap-2 md:col-span-1">
                {c.linkPagamento && (
                  <Button asChild size="sm">
                    <a href={c.linkPagamento} target="_blank" rel="noopener noreferrer">
                      Pagar
                    </a>
                  </Button>
                )}
                {c.notaFiscal &&
                  (c.notaFiscal.linkPdf ? (
                    <a
                      href={c.notaFiscal.linkPdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-fundo px-3 py-1 text-xs font-semibold text-grafite ring-1 ring-border hover:bg-marca-suave"
                    >
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" /> {NOTA[c.notaFiscal.situacao]} {c.notaFiscal.numero ?? ''}
                    </a>
                  ) : (
                    <span className={cn('rounded-full px-3 py-1 text-xs font-medium', c.notaFiscal.situacao === 'erro' ? 'bg-coral/10 text-coral-escuro' : 'bg-fundo text-texto-secundario')}>{NOTA[c.notaFiscal.situacao]}</span>
                  ))}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
