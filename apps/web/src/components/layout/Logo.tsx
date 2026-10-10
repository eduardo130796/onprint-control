import { MARCA } from '@/app/marca'
import { cn } from '@/lib/utils'

interface LogoProps {
  /** Sobre fundo escuro: a logo vai numa placa clara (as cores da marca somem no escuro) */
  placa?: boolean
  /** Só o símbolo (o G) */
  compacto?: boolean
  /** A altura vem daqui (padrão h-8) */
  className?: string
}

/** Logo da GrafyGo (imagens em public/marca, fundo transparente). Feita para fundo claro. */
export function Logo({ placa, compacto, className }: LogoProps) {
  const img = (
    <img
      src={compacto ? '/marca/grafygo-simbolo.png' : '/marca/grafygo.png'}
      alt={MARCA.produto}
      draggable={false}
      className={cn('h-8 select-none', compacto ? 'w-8' : 'w-auto', !placa && className)}
    />
  )
  if (!placa) return img
  return <span className={cn('inline-flex items-center rounded-lg bg-white px-2 py-1 shadow-sm [&>img]:h-full', className)}>{img}</span>
}
