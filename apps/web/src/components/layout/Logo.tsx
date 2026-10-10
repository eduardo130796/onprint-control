import { MARCA } from '@/app/marca'
import { cn } from '@/lib/utils'

interface LogoProps {
  /** Sobre fundo escuro: o "rafy" em branco */
  claro?: boolean
  /** Só o símbolo (o G) */
  compacto?: boolean
  /** A altura vem daqui (padrão h-8) */
  className?: string
}

/** Logo da GrafyGo (imagens em public/marca, com fundo transparente). */
export function Logo({ claro, compacto, className }: LogoProps) {
  const src = compacto ? '/marca/grafygo-simbolo.png' : claro ? '/marca/grafygo-branco.png' : '/marca/grafygo.png'
  return <img src={src} alt={MARCA.produto} draggable={false} className={cn('h-8 select-none', compacto ? 'w-8' : 'w-auto', className)} />
}
