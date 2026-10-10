import type { FormatoValor } from '@onprint/shared'
import { formatarValor } from '@/lib/formatoValor'
import { CORES_SERIES } from '@/lib/cores'
import { cn } from '@/lib/utils'


interface Serie {
  chave: string
  titulo: string
  cor?: string
}

interface BarrasProps {
  dados: Record<string, string | number | null>[]
  rotulo: string
  series: Serie[]
  formato: FormatoValor
  /** Formata o rótulo do eixo (ex.: "2026-09" → "set/26") */
  formatarRotulo?: (r: string) => string
  altura?: number
}

function Legenda({ series }: { series: Serie[] }) {
  if (series.length < 2) return null
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-texto-secundario">
      {series.map((s, i) => (
        <span key={s.chave} className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.cor ?? CORES_SERIES[i] }} /> {s.titulo}
        </span>
      ))}
    </div>
  )
}

/** Barras verticais agrupadas (várias séries por rótulo), em CSS puro. */
export function BarrasVerticais({ dados, rotulo, series, formato, formatarRotulo = (r) => r, altura = 200 }: BarrasProps) {
  const max = Math.max(1, ...dados.flatMap((d) => series.map((s) => Number(d[s.chave] ?? 0))))
  return (
    <div>
      <div className="flex items-end gap-2 overflow-x-auto" style={{ height: altura }}>
        {dados.map((d, i) => (
          <div key={i} className="flex h-full min-w-7 flex-1 flex-col justify-end">
            <div className="flex flex-1 items-end justify-center gap-0.5">
              {series.map((s, j) => {
                const v = Number(d[s.chave] ?? 0)
                return (
                  <div
                    key={s.chave}
                    className="w-full max-w-8 rounded-t"
                    style={{ height: `${(Math.max(0, v) / max) * 100}%`, backgroundColor: s.cor ?? CORES_SERIES[j] }}
                    title={`${formatarRotulo(String(d[rotulo]))} · ${s.titulo}: ${formatarValor(v, formato)}`}
                  />
                )
              })}
            </div>
            <span className="mt-1 truncate text-center text-[0.6875rem] text-texto-secundario">{formatarRotulo(String(d[rotulo] ?? ''))}</span>
          </div>
        ))}
      </div>
      <Legenda series={series} />
    </div>
  )
}

/** Barras horizontais (rankings), com o valor ao lado. Mostra as primeiras `limite` linhas. */
export function BarrasHorizontais({ dados, rotulo, series, formato, limite = 10, cores }: BarrasProps & { limite?: number; cores?: (d: Record<string, string | number | null>) => string | undefined }) {
  const linhas = dados.slice(0, limite)
  const total = (d: Record<string, string | number | null>) => series.reduce((s, x) => s + Math.max(0, Number(d[x.chave] ?? 0)), 0)
  const max = Math.max(1, ...linhas.map(total))
  return (
    <div className="space-y-2">
      {linhas.map((d, i) => (
        <div key={i} className="grid grid-cols-[minmax(5.625rem,35%)_1fr_auto] items-center gap-2 text-sm">
          <span className="truncate" title={String(d[rotulo])}>
            {String(d[rotulo] ?? '—')}
          </span>
          <div className="flex h-4 overflow-hidden rounded bg-fundo">
            {series.map((s, j) => (
              <div
                key={s.chave}
                className={cn('h-full', j === 0 && 'rounded-l')}
                style={{ width: `${(Math.max(0, Number(d[s.chave] ?? 0)) / max) * 100}%`, backgroundColor: cores?.(d) ?? s.cor ?? CORES_SERIES[j] }}
                title={`${s.titulo}: ${formatarValor(Number(d[s.chave] ?? 0), formato)}`}
              />
            ))}
          </div>
          <span className="text-right text-xs font-medium tabular-nums">{formatarValor(total(d), formato)}</span>
        </div>
      ))}
      {dados.length > limite && <p className="text-xs text-texto-secundario">+ {dados.length - limite} na tabela</p>}
      <Legenda series={series} />
    </div>
  )
}
