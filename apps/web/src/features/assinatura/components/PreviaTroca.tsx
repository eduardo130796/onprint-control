import { ArrowDownRight, ArrowUpRight, CalendarClock } from 'lucide-react'
import { formatarDataSimples, formatarMoeda, type PreviaTrocaPlano } from '@onprint/shared'

/** O que acontece ao trocar de plano: diferença proporcional (upgrade), data (downgrade) e a mensalidade nova. */
export function PreviaTroca({ p, planoAtual }: { p: PreviaTrocaPlano; planoAtual: string }) {
  if (p.tipo === 'downgrade') {
    return (
      <span className="block space-y-3 text-left">
        <span className="flex items-start gap-3 rounded-2xl bg-fundo p-4">
          <ArrowDownRight className="mt-0.5 h-5 w-5 shrink-0 text-grafite" aria-hidden="true" />
          <span>
            Você já pagou o <strong>{planoAtual}</strong> neste período: ele continua valendo até <strong>{formatarDataSimples(p.valeA)}</strong>. A partir daí, o plano passa a ser o{' '}
            <strong>{p.plano.nome}</strong> por <strong>{formatarMoeda(p.novaMensalidade.valor)}/mês</strong>.
          </span>
        </span>
        <span className="block text-xs text-texto-secundario">Sem cobrança extra e sem estorno. Você pode desfazer até lá.</span>
      </span>
    )
  }
  if (p.tipo === 'upgrade') {
    return (
      <span className="block space-y-3 text-left">
        <span className="flex items-start gap-3 rounded-2xl bg-marca-suave p-4">
          <ArrowUpRight className="mt-0.5 h-5 w-5 shrink-0 text-marca-escuro" aria-hidden="true" />
          <span>
            O <strong>{p.plano.nome}</strong> libera agora.{' '}
            {p.valorProporcional ? (
              <>
                Hoje você paga só a <strong>diferença proporcional: {formatarMoeda(p.valorProporcional)}</strong> ({p.diasRestantes} de {p.diasPeriodo} dias que faltam até {p.periodo && formatarDataSimples(p.periodo.fim)}).
              </>
            ) : (
              'A diferença dos dias que faltam neste período é pequena e não será cobrada.'
            )}
          </span>
        </span>
        <span className="flex items-center gap-2 text-sm">
          <CalendarClock className="h-4 w-4 text-texto-secundario" aria-hidden="true" />
          Mensalidade de {formatarMoeda(p.novaMensalidade.valor)} a partir de {p.novaMensalidade.aPartirDe ? formatarDataSimples(p.novaMensalidade.aPartirDe) : 'a próxima'}.
        </span>
        <span className="block text-xs text-texto-secundario">Mensalidades vencidas continuam com o valor do plano em que foram usadas.</span>
      </span>
    )
  }
  return (
    <span className="block text-left">
      O plano muda agora para o <strong>{p.plano.nome}</strong>. A próxima mensalidade já vem em <strong>{formatarMoeda(p.novaMensalidade.valor)}</strong>.
    </span>
  )
}
