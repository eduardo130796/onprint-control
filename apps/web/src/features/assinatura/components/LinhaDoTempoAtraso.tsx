import { AlertTriangle, Check, Eye, Lock, CalendarX } from 'lucide-react'
import { adicionarDias, formatarDataSimples, type MinhaAssinatura } from '@onprint/shared'
import { cn } from '@/lib/utils'

/**
 * Onde a empresa está na escada do atraso (vencimento → aviso → só leitura → bloqueio), com as datas.
 * Sem atraso, mostra a política de forma discreta (`informativo`).
 */
export function LinhaDoTempoAtraso({ a, informativo = false }: { a: MinhaAssinatura; informativo?: boolean }) {
  const { acesso, plano } = a
  const vencimento = acesso.motivo === 'teste_expirado' ? a.testeAte : acesso.motivo === 'cortesia_encerrada' ? (a.cortesia?.ate ?? null) : a.atrasoDesde
  const etapas = [
    { chave: 'vencimento', rotulo: acesso.motivo === 'teste_expirado' ? 'Fim do teste' : acesso.motivo === 'cortesia_encerrada' ? 'Fim da cortesia' : 'Vencimento', Icone: CalendarX, data: vencimento },
    { chave: 'aviso', rotulo: 'Aviso no sistema', Icone: AlertTriangle, data: vencimento ? adicionarDias(vencimento, 1) : null },
    { chave: 'leitura', rotulo: 'Somente leitura', Icone: Eye, data: vencimento ? adicionarDias(vencimento, plano.diasAteSomenteLeitura) : null },
    { chave: 'bloqueio', rotulo: 'Bloqueio', Icone: Lock, data: vencimento ? adicionarDias(vencimento, plano.diasAteBloqueio) : null },
  ]
  const atual = informativo ? -1 : acesso.nivel === 'bloqueado' ? 3 : acesso.nivel === 'somente_leitura' ? 2 : acesso.diasAtraso > 0 ? 1 : 0
  const cor = ['bg-grafite', 'bg-amber-500', 'bg-coral', 'bg-red-600'][atual] ?? 'bg-grafite'

  if (informativo) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-5">
        <p className="text-sm font-semibold text-tinta">Se a mensalidade atrasar</p>
        <ol className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <li className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <span>
              <strong className="text-tinta">1º ao {plano.diasAteSomenteLeitura - 1}º dia:</strong> tudo funciona, com um aviso no topo.
            </span>
          </li>
          <li className="flex gap-3">
            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-coral-escuro" aria-hidden="true" />
            <span>
              <strong className="text-tinta">A partir do {plano.diasAteSomenteLeitura}º dia:</strong> só consulta e exportação.
            </span>
          </li>
          <li className="flex gap-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-tinta" aria-hidden="true" />
            <span>
              <strong className="text-tinta">A partir do {plano.diasAteBloqueio}º dia:</strong> bloqueio até o pagamento. Os dados ficam guardados.
            </span>
          </li>
        </ol>
      </div>
    )
  }

  const proxima = etapas[atual + 1]
  return (
    <section className="rounded-3xl bg-card p-6 shadow-suave" aria-label="Situação do atraso">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-titulo text-lg font-extrabold text-tinta">{atual === 3 ? 'Seu acesso está pausado' : 'Regularize para não perder o acesso'}</h3>
          <p className="mt-1 text-sm text-texto-secundario">
            {atual === 3
              ? 'Assim que o pagamento for confirmado, tudo volta na hora. Nenhum dado foi apagado.'
              : proxima?.data
                ? `Próxima etapa: ${proxima.rotulo.toLowerCase()} em ${formatarDataSimples(proxima.data)}.`
                : acesso.mensagem}
          </p>
        </div>
      </div>

      <ol className="relative mt-6 grid grid-cols-4 gap-2">
        <span className="absolute left-[12.5%] right-[12.5%] top-5 h-1 rounded-full bg-fundo" aria-hidden="true" />
        <span className={cn('absolute left-[12.5%] top-5 h-1 rounded-full transition-all', cor)} style={{ width: `${(Math.max(atual, 0) / 3) * 75}%` }} aria-hidden="true" />
        {etapas.map((e, i) => {
          const feita = i < atual
          const agora = i === atual
          return (
            <li key={e.chave} className="relative flex flex-col items-center text-center">
              <span
                className={cn(
                  'relative z-10 flex h-11 w-11 items-center justify-center rounded-full ring-4 ring-card',
                  agora ? cn(cor, 'text-white shadow-lg') : feita ? 'bg-grafite text-white' : 'bg-fundo text-texto-secundario',
                )}
                aria-current={agora ? 'step' : undefined}
              >
                {feita ? <Check className="h-5 w-5" aria-hidden="true" /> : <e.Icone className="h-5 w-5" aria-hidden="true" />}
              </span>
              <span className={cn('mt-2 text-xs font-semibold sm:text-sm', agora ? 'text-tinta' : 'text-texto-secundario')}>{e.rotulo}</span>
              <span className="text-[11px] text-texto-secundario sm:text-xs">{e.data ? formatarDataSimples(e.data) : '—'}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
