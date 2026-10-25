import { useState } from 'react'
import { ArrowRight, Check, ShieldCheck } from 'lucide-react'
import { economiaAnual, formatarMoeda, mensalNoAnual, type CicloAssinatura } from '@onprint/shared'
import { cn } from '@/lib/utils'
import { SEMPRE_INCLUSO, TUDO_INCLUIDO } from '../conteudo'
import { linkCadastro, type PlanoPublico, type PlanosPublicos } from '../dados'

function Preco({ p, ciclo }: { p: PlanoPublico; ciclo: CicloAssinatura }) {
  const anual = ciclo === 'anual' && p.valorAnual
  return (
    <div className="mt-6">
      <p className="flex items-baseline gap-1.5">
        <span className="font-titulo text-[3.25rem] font-extrabold leading-none tracking-tight text-[#021A40] sm:text-6xl">{formatarMoeda(anual ? mensalNoAnual(p.valorAnual as string) : p.valorMensal)}</span>
        <span className="text-base text-slate-500">/mês</span>
      </p>
      <p className="mt-3 text-sm text-slate-600">
        {anual ? (
          <>
            {formatarMoeda(p.valorAnual as string)} pagos uma vez por ano · <span className="whitespace-nowrap font-semibold text-emerald-700">você economiza {formatarMoeda(economiaAnual(p.valorMensal, p.valorAnual as string))}</span>
          </>
        ) : p.valorAnual ? (
          <>
            Cobrado todo mês, sem fidelidade. <span className="whitespace-nowrap">Ou {formatarMoeda(p.valorAnual)} no anual (2 meses grátis).</span>
          </>
        ) : (
          'Cobrado todo mês, sem fidelidade.'
        )}
      </p>
    </div>
  )
}

/** Página de venda: um plano só, com tudo incluído. Mensal ou anual; o botão leva ao cadastro com o ciclo escolhido. */
export function Planos({ dados, cupom }: { dados: PlanosPublicos | null; cupom: string | null }) {
  const plano = dados?.planos[0]
  const temAnual = Boolean(plano?.valorAnual)
  const [ciclo, setCiclo] = useState<CicloAssinatura>('mensal')
  const cicloEfetivo: CicloAssinatura = temAnual ? ciclo : 'mensal'
  const garantias = [...SEMPRE_INCLUSO, ...(dados?.notaFiscal ? ['Nota fiscal de cada pagamento'] : [])]

  if (!plano) {
    return <div className="mx-auto h-[34rem] max-w-5xl animate-pulse rounded-[2rem] bg-white/70 ring-1 ring-slate-200" aria-busy="true" aria-label="Carregando o preço" />
  }

  return (
    <article className="mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-[0_2rem_4rem_-1.5rem_rgba(2,101,220,0.35)] ring-2 ring-[#0265DC] lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col p-7 sm:p-10">
        <p className="inline-flex w-fit items-center rounded-full bg-[#E6F2FE] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[#0265DC]">Tudo incluído</p>
        <h3 className="mt-4 font-titulo text-3xl font-extrabold text-[#021A40]">{plano.nome}</h3>
        <p className="mt-2 text-slate-600">O sistema inteiro, com WhatsApp e vitrine online, para quantas pessoas da equipe você precisar.</p>

        {temAnual && (
          <div role="radiogroup" aria-label="Forma de cobrança" className="mt-7 inline-flex w-fit rounded-full bg-slate-100 p-1">
            {(['mensal', 'anual'] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={cicloEfetivo === c}
                onClick={() => setCiclo(c)}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0265DC] sm:px-5',
                  cicloEfetivo === c ? 'bg-[#021A40] text-white shadow' : 'text-slate-600 hover:text-slate-900',
                )}
              >
                {c === 'mensal' ? 'Mensal' : 'Anual'}
                {c === 'anual' && <span className={cn('ml-2 rounded-full px-2 py-0.5 text-xs font-bold', cicloEfetivo === c ? 'bg-[#02BAF8] text-[#021A40]' : 'bg-emerald-100 text-emerald-800')}>2 meses grátis</span>}
              </button>
            ))}
          </div>
        )}

        <Preco p={plano} ciclo={cicloEfetivo} />

        <a
          href={linkCadastro(dados, { ciclo: cicloEfetivo, cupom })}
          className="mt-8 inline-flex h-14 items-center justify-center gap-2 rounded-full bg-[#0265DC] px-7 text-base font-bold text-white shadow-lg shadow-[#0265DC]/30 transition hover:bg-[#024DCC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0265DC] focus-visible:ring-offset-2"
        >
          Testar grátis por {plano.diasTeste} dias <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
        <p className="mt-3 text-center text-sm text-slate-500">Sem cartão de crédito. Você só paga se decidir continuar.</p>

        <ul className="mt-auto grid gap-2 border-t border-slate-100 pt-6 text-sm text-slate-600 sm:grid-cols-2 lg:mt-8">
          {garantias.map((t) => (
            <li key={t} className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> {t}
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-[#F5F8FC] p-7 sm:p-10">
        <h4 className="font-titulo text-lg font-extrabold text-[#021A40]">O que vem no plano</h4>
        <ul className="mt-5 space-y-3.5">
          {TUDO_INCLUIDO.map((t) => (
            <li key={t} className="flex items-start gap-3 text-[0.9375rem] text-slate-700">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0265DC] text-white">
                <Check className="h-3 w-3" aria-hidden="true" />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}
