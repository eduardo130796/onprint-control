import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatarMetros } from '../formato'

/** Campos do site (maiores e mais arejados que os do sistema) */

export const classeCampo =
  'h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-[0.9375rem] text-slate-900 transition placeholder:text-slate-400 focus:border-marca focus:outline-none focus:ring-4 focus:ring-marca/15 aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus:ring-red-500/15'

export function Rotulo({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-sm font-semibold text-slate-900', className)} {...props} />
}

export function MensagemErro({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null
  return (
    <p id={id} className="mt-1.5 text-sm font-medium text-red-600">
      {children}
    </p>
  )
}

/** Campo de texto com rótulo, dica e erro ligados por aria */
export function CampoTexto({
  id,
  rotulo,
  dica,
  erro,
  opcional,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { id: string; rotulo: string; dica?: string; erro?: string; opcional?: boolean }) {
  const descricao = [erro && `${id}-erro`, dica && `${id}-dica`].filter(Boolean).join(' ') || undefined
  return (
    <div className={className}>
      <Rotulo htmlFor={id}>
        {rotulo} {opcional && <span className="font-normal text-slate-400">(opcional)</span>}
      </Rotulo>
      <input id={id} aria-invalid={erro ? true : undefined} aria-describedby={descricao} className={classeCampo} {...props} />
      {dica && !erro && (
        <p id={`${id}-dica`} className="mt-1.5 text-xs text-slate-500">
          {dica}
        </p>
      )}
      <MensagemErro id={`${id}-erro`}>{erro}</MensagemErro>
    </div>
  )
}

/** Quantidade com botões − e + */
export function CampoQuantidade({ id, valor, aoMudar, erro, compacto }: { id: string; valor: string; aoMudar: (v: string) => void; erro?: string; compacto?: boolean }) {
  const n = Math.trunc(Number(valor)) || 0
  const botao =
    'flex shrink-0 items-center justify-center text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-marca disabled:opacity-40'
  return (
    <div>
      <Rotulo htmlFor={id} className={compacto ? 'sr-only' : undefined}>
        Quantidade
      </Rotulo>
      <div
        className={cn(
          'inline-flex items-stretch overflow-hidden rounded-xl border bg-white focus-within:border-marca focus-within:ring-4 focus-within:ring-marca/15',
          erro ? 'border-red-500' : 'border-slate-300',
          compacto ? 'h-10' : 'h-12',
        )}
      >
        <button type="button" className={cn(botao, compacto ? 'w-9' : 'w-12')} onClick={() => aoMudar(String(Math.max(1, n - 1)))} disabled={n <= 1} aria-label="Diminuir quantidade">
          <Minus className="h-4 w-4" />
        </button>
        <input
          id={id}
          inputMode="numeric"
          value={valor}
          onChange={(e) => aoMudar(e.target.value.replace(/\D/g, '').slice(0, 7))}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${id}-erro` : undefined}
          className={cn('min-w-0 border-x border-slate-200 bg-transparent text-center font-semibold text-slate-900 focus:outline-none', compacto ? 'w-14 text-sm' : 'w-20 text-base')}
        />
        <button type="button" className={cn(botao, compacto ? 'w-9' : 'w-12')} onClick={() => aoMudar(String(Math.min(1_000_000, n + 1)))} aria-label="Aumentar quantidade">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <MensagemErro id={`${id}-erro`}>{erro}</MensagemErro>
    </div>
  )
}

/** Medida em metros (aceita vírgula), com a máxima como dica */
export function CampoMedida({
  id,
  rotulo,
  valor,
  aoMudar,
  maxima,
  erro,
  compacto,
}: {
  id: string
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  maxima?: string | null
  erro?: string
  compacto?: boolean
}) {
  const descricao = [erro && `${id}-erro`, maxima && `${id}-max`].filter(Boolean).join(' ') || undefined
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={cn('mb-1.5 block font-medium text-slate-600', compacto ? 'text-xs' : 'text-sm')}>
        {rotulo}
      </label>
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          value={valor}
          onChange={(e) => aoMudar(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))}
          placeholder="0,00"
          aria-invalid={erro ? true : undefined}
          aria-describedby={descricao}
          className={cn(classeCampo, 'pr-9', compacto && 'h-10 text-sm')}
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400" aria-hidden="true">
          m
        </span>
      </div>
      {maxima && !erro && (
        <p id={`${id}-max`} className="mt-1 text-xs text-slate-500">
          Máx. {formatarMetros(maxima)}
        </p>
      )}
      <MensagemErro id={`${id}-erro`}>{erro}</MensagemErro>
    </div>
  )
}
