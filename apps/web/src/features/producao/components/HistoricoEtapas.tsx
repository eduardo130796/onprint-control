import { ArrowRight, ShieldAlert } from 'lucide-react'
import { formatarDataHora, type OrdemProducaoDetalhe } from '@onprint/shared'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatarDuracao } from '@/lib/datas'

/** Histórico de etapas da OP: quem moveu, quando e quanto tempo ficou na etapa anterior. */
export function HistoricoEtapas({ historico }: { historico: OrdemProducaoDetalhe['historico'] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Histórico de etapas</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3 text-sm">
          {[...historico].reverse().map((h) => (
            <li key={h.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                {h.etapaDe && (
                  <>
                    <StatusBadge entidade="producao" codigo={h.etapaDe} />
                    <ArrowRight className="h-3.5 w-3.5 text-texto-secundario" />
                  </>
                )}
                <StatusBadge entidade="producao" codigo={h.etapaPara} />
                <span className="ml-auto text-xs text-texto-secundario">{formatarDataHora(h.createdAt)}</span>
              </div>
              <p className="mt-1 text-xs text-texto-secundario">
                {h.usuario?.nome ?? 'Sistema'}
                {h.etapaDe ? ` · ficou ${formatarDuracao(h.segundosNaEtapa)} na etapa anterior` : ' · OP criada'}
              </p>
              {h.override && (
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-ambar">
                  <ShieldAlert className="h-3.5 w-3.5" /> Liberada sem arte aprovada: {h.motivo}
                </p>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
