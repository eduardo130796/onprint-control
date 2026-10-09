import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Bloco padrão do painel: cartão arredondado com título, subtítulo e ações à direita. */
export function Secao({ titulo, subtitulo, icone: Icone, acoes, children, className, rotulo }: { titulo?: string; subtitulo?: ReactNode; icone?: LucideIcon; acoes?: ReactNode; children: ReactNode; className?: string; rotulo?: string }) {
  return (
    <section className={cn('min-w-0 rounded-3xl bg-card p-5 shadow-suave sm:p-7', className)} aria-label={rotulo ?? titulo}>
      {(titulo || acoes) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {Icone && (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-grafite text-marca">
                <Icone className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              {titulo && <h2 className="font-titulo text-lg font-extrabold text-tinta">{titulo}</h2>}
              {subtitulo && <p className="text-sm text-texto-secundario">{subtitulo}</p>}
            </div>
          </div>
          {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/** Cabeçalho das páginas do painel (título forte, subtítulo e ações). */
export function CabecalhoPlataforma({ sobretitulo, titulo, subtitulo, acoes }: { sobretitulo?: string; titulo: string; subtitulo?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {sobretitulo && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-marca-escuro">{sobretitulo}</p>}
        <h1 className="font-titulo text-2xl font-extrabold tracking-tight text-tinta sm:text-3xl">{titulo}</h1>
        {subtitulo && <p className="mt-1 max-w-2xl text-sm text-texto-secundario">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  )
}
