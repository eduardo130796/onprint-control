import { ExternalLink, FileText } from 'lucide-react'
import { formatarDataSimples, formatarMoeda, type CobrancaResumo } from '@onprint/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const SITUACAO: Record<CobrancaResumo['situacao'], [string, string]> = {
  pendente: ['Em aberto', 'bg-slate-100 text-texto-secundario'],
  vencida: ['Vencida', 'bg-coral/10 text-coral-escuro'],
  paga: ['Paga', 'bg-green-100 text-green-800'],
  cancelada: ['Cancelada', 'bg-slate-100 text-texto-secundario'],
  estornada: ['Estornada', 'bg-amber-100 text-amber-900'],
}
const FORMA: Record<string, string> = { PIX: 'PIX', BOLETO: 'Boleto', CREDIT_CARD: 'Cartão', UNDEFINED: '—', manual: 'Manual' }
const NOTA: Record<string, string> = { agendada: 'Nota em emissão', emitida: 'Nota fiscal', erro: 'Nota com erro', cancelada: 'Nota cancelada' }

/** Mensalidades (mais recentes primeiro), com link para pagar as abertas e a nota fiscal das pagas. */
export function HistoricoCobrancas({ cobrancas }: { cobrancas: CobrancaResumo[] }) {
  if (cobrancas.length === 0) return null
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Mensalidades</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border text-sm">
          {cobrancas.map((c) => {
            const [rotulo, cor] = SITUACAO[c.situacao]
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <span className="w-24 tabular-nums">{formatarDataSimples(c.vencimento)}</span>
                <span className="w-24 font-medium tabular-nums">{formatarMoeda(c.valor)}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', cor)}>{rotulo}</span>
                <span className="text-texto-secundario">
                  {c.situacao === 'paga' && c.pagoEm ? `${FORMA[c.forma ?? ''] ?? c.forma ?? ''} · pago em ${formatarDataSimples(c.pagoEm)}` : (c.falha ?? '')}
                </span>
                <span className="ml-auto flex items-center gap-3">
                  {c.linkPagamento && (
                    <a href={c.linkPagamento} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-marca-escuro hover:underline">
                      <ExternalLink className="h-3.5 w-3.5" /> Pagar
                    </a>
                  )}
                  {c.notaFiscal &&
                    (c.notaFiscal.linkPdf ? (
                      <a href={c.notaFiscal.linkPdf} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-marca-escuro hover:underline">
                        <FileText className="h-3.5 w-3.5" /> {NOTA[c.notaFiscal.situacao]} {c.notaFiscal.numero ?? ''}
                      </a>
                    ) : (
                      <span className={cn('text-xs', c.notaFiscal.situacao === 'erro' ? 'text-coral-escuro' : 'text-texto-secundario')}>{NOTA[c.notaFiscal.situacao]}</span>
                    ))}
                </span>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
