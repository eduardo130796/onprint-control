import { cn } from '@/lib/utils'

interface LogoProps {
  claro?: boolean
  compacto?: boolean
  className?: string
}

export function Logo({ claro, compacto, className }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill={claro ? '#FFFFFF' : '#0B4F5C'} fillOpacity={claro ? 0.12 : 1} />
        <circle cx="16" cy="16" r="8" fill="none" stroke="#14B8A6" strokeWidth="4" />
      </svg>
      {!compacto && (
        <span className={cn('text-lg font-bold tracking-tight', claro ? 'text-white' : 'text-petroleo')}>
          ON<span className="text-turquesa-claro">Print</span>
          <span className={cn('ml-1 font-medium', claro ? 'text-white/80' : 'text-texto-secundario')}>Control</span>
        </span>
      )}
    </div>
  )
}
