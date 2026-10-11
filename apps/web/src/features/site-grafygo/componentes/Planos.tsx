import { useState } from 'react'
import { Check, Clock, Crown, Sparkles } from 'lucide-react'
import { economiaAnual, formatarMoeda, mensalNoAnual, type CicloAssinatura } from '@onprint/shared'
import { cn } from '@/lib/utils'
import { INCLUSO } from '../conteudo'
import { linkCadastro, type PlanoPublico, type PlanosPublicos } from '../dados'

/** O que cada módulo entrega, em linguagem de venda (a ordem segue os planos) */
const RECURSO_DO_MODULO: Record<string, string> = {
  orcamentos: 'Orçamentos com cálculo automático',
  pedidos: 'Pedidos, entregas e etiquetas',
  artes: 'Aprovação de arte por link',
  clientes: 'Clientes e histórico de compras',
  fornecedores: 'Fornecedores',
  produtos: 'Catálogo, insumos e precificação',
  financeiro: 'Contas a pagar e a receber',
  caixa: 'Caixa e venda balcão (PDV)',
  producao: 'Ordens de produção e kanban',
  pcp: 'PCP: carga de máquinas e prazos',
  estoque: 'Estoque, compras e alertas',
  relatorios: 'Relatórios e lucratividade',
  vitrine: 'Vitrine online: site + catálogo no WhatsApp',
}
/** Módulos ainda em desenvolvimento: aparecem como "em breve" */
const EM_BREVE: Record<string, string> = { whatsapp: 'Integração com o WhatsApp' }

function Preco({ p, ciclo }: { p: PlanoPublico; ciclo: CicloAssinatura }) {
  if (ciclo === 'anual' && p.valorAnual) {
    return (
      <div className="mt-5">
        <p className="flex items-baseline gap-1">
          <span className="font-titulo text-[2.75rem] font-extrabold leading-none tracking-tight text-[#021A40]">{formatarMoeda(mensalNoAnual(p.valorAnual))}</span>
          <span className="text-sm text-slate-500">/mês</span>
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {formatarMoeda(p.valorAnual)} por ano · <span className="whitespace-nowrap font-semibold text-emerald-700">economize {formatarMoeda(economiaAnual(p.valorMensal, p.valorAnual))}</span>
        </p>
      </div>
    )
  }
  return (
    <div className="mt-5">
      <p className="flex items-baseline gap-1">
        <span className="font-titulo text-[2.75rem] font-extrabold leading-none tracking-tight text-[#021A40]">{formatarMoeda(p.valorMensal)}</span>
        <span className="text-sm text-slate-500">/mês</span>
      </p>
      <p className="mt-2 text-sm text-slate-500">Cobrado todo mês · sem fidelidade</p>
    </div>
  )
}

export function Planos({ dados, cupom }: { dados: PlanosPublicos | null; cupom: string | null }) {
  const temAnual = Boolean(dados?.planos.some((p) => p.valorAnual))
  const [ciclo, setCiclo] = useState<CicloAssinatura>('anual')
  const cicloEfetivo: CicloAssinatura = temAnual ? ciclo : 'mensal'
  const planos = dados?.planos ?? []
  const destaque = planos.length === 3 ? planos[1]?.codigo : undefined

  return (
    <div>
      {temAnual && (
        <div className="flex justify-center">
          <div role="radiogroup" aria-label="Forma de cobrança" className="inline-flex rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200">
            {(['mensal', 'anual'] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={cicloEfetivo === c}
                onClick={() => setCiclo(c)}
                className={cn(
                  'rounded-full px-5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0265DC]',
                  cicloEfetivo === c ? 'bg-[#021A40] text-white shadow' : 'text-slate-600 hover:text-slate-900',
                )}
              >
                {c === 'mensal' ? 'Mensal' : 'Anual'}
                {c === 'anual' && <span className={cn('ml-2 rounded-full px-2 py-0.5 text-xs font-bold', cicloEfetivo === c ? 'bg-[#02BAF8] text-[#021A40]' : 'bg-emerald-100 text-emerald-800')}>2 meses grátis</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {!dados ? (
        <div className="mt-10 grid gap-6 lg:grid-cols-3" aria-busy="true" aria-label="Carregando planos">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[30rem] animate-pulse rounded-3xl bg-white/70 ring-1 ring-slate-200" />
          ))}
        </div>
      ) : (
        <div className="mt-10 grid items-stretch gap-6 lg:grid-cols-3">
          {planos.map((p, i) => {
            const anterior = planos[i - 1]
            const novos = p.modulos.filter((m) => RECURSO_DO_MODULO[m] && !anterior?.modulos.includes(m))
            const emBreve = p.modulos.filter((m) => EM_BREVE[m])
            const ehDestaque = p.codigo === destaque
            return (
              <article
                key={p.codigo}
                className={cn(
                  'relative flex flex-col rounded-3xl p-7 sm:p-8',
                  ehDestaque ? 'bg-white shadow-[0_2rem_4rem_-1.5rem_rgba(2,101,220,0.45)] ring-2 ring-[#0265DC] lg:-my-4 lg:py-11' : 'bg-white shadow-sm ring-1 ring-slate-200',
                )}
              >
                {ehDestaque && (
                  <span className="absolute -top-3.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#0265DC] px-3.5 py-1 text-xs font-bold text-white shadow">
                    <Crown className="h-3.5 w-3.5" aria-hidden="true" /> Mais escolhido
                  </span>
                )}
                <h3 className="font-titulo text-2xl font-extrabold text-[#021A40]">{p.nome}</h3>
                <p className="mt-2 min-h-[3rem] text-sm leading-relaxed text-slate-600">{p.descricao}</p>
                <Preco p={p} ciclo={cicloEfetivo} />
                <a
                  href={linkCadastro(dados, { plano: p.codigo, ciclo: cicloEfetivo, cupom })}
                  className={cn(
                    'mt-7 inline-flex h-12 items-center justify-center rounded-full px-6 text-[0.9375rem] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0265DC] focus-visible:ring-offset-2',
                    ehDestaque ? 'bg-[#0265DC] text-white shadow-lg shadow-[#0265DC]/30 hover:bg-[#024DCC]' : 'bg-[#021A40] text-white hover:bg-[#0B2A5C]',
                  )}
                >
                  Testar grátis por {p.diasTeste} dias
                </a>
                <p className="mt-2 text-center text-xs text-slate-500">Sem cartão de crédito</p>

                <ul className="mt-7 space-y-3 border-t border-slate-100 pt-7 text-sm">
                  <li className="flex items-start gap-2.5 font-semibold text-[#021A40]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0265DC]" aria-hidden="true" />
                    {p.limiteUsuarios ? `Até ${p.limiteUsuarios} usuários` : 'Usuários ilimitados'}
                  </li>
                  {anterior && (
                    <li className="flex items-start gap-2.5 font-semibold text-[#021A40]">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0265DC]" aria-hidden="true" />
                      Tudo do {anterior.nome}, mais:
                    </li>
                  )}
                  {novos.map((m) => (
                    <li key={m} className={cn('flex items-start gap-2.5 text-slate-700', m === 'vitrine' && 'font-semibold text-[#021A40]')}>
                      {m === 'vitrine' ? <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#F97316]" aria-hidden="true" /> : <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0265DC]" aria-hidden="true" />}
                      {RECURSO_DO_MODULO[m]}
                    </li>
                  ))}
                  {emBreve.map((m) => (
                    <li key={m} className="flex items-start gap-2.5 text-slate-500">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>
                        {EM_BREVE[m]} <span className="ml-1 inline-block whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[0.6875rem] font-semibold">em breve</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            )
          })}
        </div>
      )}

      <div className="mt-14 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-slate-200 sm:p-9">
        <h3 className="text-center font-titulo text-lg font-extrabold text-[#021A40]">Todos os planos incluem</h3>
        <ul className="mt-6 grid gap-x-6 gap-y-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
          {[...INCLUSO, ...(dados?.notaFiscal ? ['Nota fiscal de cada pagamento'] : [])].map((t) => (
            <li key={t} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> {t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
