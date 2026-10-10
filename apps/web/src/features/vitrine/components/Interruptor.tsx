import { cn } from '@/lib/utils'

interface InterruptorProps {
  marcado: boolean
  onMudar: (marcado: boolean) => void
  rotulo: string
  desabilitado?: boolean
  /** Explica por que está desabilitado (ex.: produto inativo) */
  dica?: string
  className?: string
}

/** Interruptor liga/desliga acessível (role="switch"), na cor da marca. */
export function Interruptor({ marcado, onMudar, rotulo, desabilitado, dica, className }: InterruptorProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={marcado}
      aria-label={rotulo}
      title={dica ?? rotulo}
      disabled={desabilitado}
      onClick={(e) => {
        // Na tabela, o clique no interruptor não abre o painel da linha
        e.stopPropagation()
        onMudar(!marcado)
      }}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50',
        marcado ? 'bg-marca' : 'bg-tinta/20',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform', marcado ? 'translate-x-[1.375rem]' : 'translate-x-0.5')}
      />
    </button>
  )
}
