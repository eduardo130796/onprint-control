import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Bloco das telas de custo: cartão arredondado com ícone, título e uma frase explicando para que serve. */
export function Secao({ icone: Icone, titulo, descricao, acao, children, className }: { icone: LucideIcon; titulo: string; descricao?: ReactNode; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-3xl bg-card p-5 shadow-suave sm:p-6', className)} aria-label={titulo}>
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-marca-suave text-marca-escuro">
          <Icone className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-titulo text-lg font-extrabold text-tinta">{titulo}</h2>
          {descricao && <p className="text-sm text-texto-secundario">{descricao}</p>}
        </div>
        {acao && <div className="flex shrink-0 flex-wrap gap-2">{acao}</div>}
      </div>
      {children}
    </section>
  )
}

/** Cartão selecionável (radio) usado nas escolhas de nível, embalagem e rateio. */
export function CartaoOpcao({ marcado, onClick, icone: Icone, titulo, descricao, desabilitado, className }: { marcado: boolean; onClick: () => void; icone?: LucideIcon; titulo: string; descricao?: ReactNode; desabilitado?: boolean; className?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={marcado}
      disabled={desabilitado}
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 rounded-2xl p-3.5 text-left ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
        marcado ? 'bg-marca-suave ring-2 ring-marca' : 'bg-card ring-border hover:bg-fundo',
        className,
      )}
    >
      {Icone && (
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', marcado ? 'bg-marca text-marca-contraste' : 'bg-fundo text-tinta')}>
          <Icone className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0">
        <span className={cn('block text-sm font-semibold', marcado ? 'text-marca-escuro' : 'text-tinta')}>{titulo}</span>
        {descricao && <span className="mt-0.5 block text-xs text-texto-secundario">{descricao}</span>}
      </span>
    </button>
  )
}

/** Dica curta embaixo do campo. */
export function Dica({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-xs text-texto-secundario">{children}</p>
}
