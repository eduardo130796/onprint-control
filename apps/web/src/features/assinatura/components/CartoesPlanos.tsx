import { Check, Crown } from 'lucide-react'
import { MODULO_ROTULOS, formatarMoeda, type MinhaAssinatura, type Modulo } from '@onprint/shared'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Plano = MinhaAssinatura['planos'][number]

interface Props {
  planos: Plano[]
  /** Plano marcado (escolha na assinatura) */
  selecionado?: string
  onEscolher?: (codigo: string) => void
  /** Texto do botão de cada plano que não é o atual (ex.: "Mudar para este") */
  acao?: string
}

/**
 * Comparação de planos: preço em destaque, o que cada um libera e o plano atual marcado.
 * O plano do meio (quando há três) leva o selo "Mais escolhido".
 */
export function CartoesPlanos({ planos, selecionado, onEscolher, acao }: Props) {
  const destaque = planos.length === 3 ? planos[1]?.codigo : undefined
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {planos.map((p) => {
        const marcado = selecionado ? selecionado === p.codigo : p.atual
        const clicavel = Boolean(onEscolher) && !acao
        const Conteudo = clicavel ? 'button' : 'div'
        return (
          <Conteudo
            key={p.codigo}
            type={clicavel ? 'button' : undefined}
            onClick={clicavel ? () => onEscolher?.(p.codigo) : undefined}
            aria-pressed={clicavel ? marcado : undefined}
            className={cn(
              'relative flex flex-col rounded-3xl bg-card p-6 text-left shadow-suave ring-1 transition',
              marcado ? 'ring-2 ring-marca shadow-lg' : 'ring-border',
              clicavel && 'hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-escuro',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-titulo text-xl font-extrabold text-tinta">{p.nome}</h3>
              {p.atual ? (
                <span className="rounded-full bg-grafite px-2.5 py-0.5 text-[0.6875rem] font-bold text-white">Seu plano</span>
              ) : p.codigo === destaque ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-laranja-suave px-2.5 py-0.5 text-[0.6875rem] font-bold text-laranja-escuro">
                  <Crown className="h-3 w-3" aria-hidden="true" /> Mais escolhido
                </span>
              ) : null}
            </div>
            <p className="mt-1 min-h-10 text-sm text-texto-secundario">{p.descricao}</p>
            <p className="mt-4">
              <span className="font-titulo text-4xl font-extrabold tracking-tight text-tinta">{formatarMoeda(p.valorMensal)}</span>
              <span className="text-sm text-texto-secundario">/mês</span>
            </p>

            <ul className="mt-5 space-y-2 border-t border-border pt-5 text-sm">
              <li className="flex items-center gap-2 font-semibold text-tinta">
                <Check className="h-4 w-4 shrink-0 text-marca-escuro" aria-hidden="true" />
                {p.limiteUsuarios ? `Até ${p.limiteUsuarios} usuários` : 'Usuários ilimitados'}
              </li>
              {p.modulos.map((m) => (
                <li key={m} className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-marca-escuro" aria-hidden="true" />
                  {MODULO_ROTULOS[m as Modulo] ?? m}
                </li>
              ))}
            </ul>

            {acao && !p.atual && onEscolher && (
              <Button variant={p.codigo === destaque ? 'default' : 'outline'} className="mt-6 w-full" onClick={() => onEscolher(p.codigo)}>
                {acao}
              </Button>
            )}
            {clicavel && (
              <span className={cn('mt-6 flex h-10 items-center justify-center rounded-xl text-sm font-bold', marcado ? 'bg-marca text-marca-contraste' : 'bg-fundo text-tinta')}>
                {marcado ? 'Selecionado' : 'Escolher'}
              </span>
            )}
          </Conteudo>
        )
      })}
    </div>
  )
}
