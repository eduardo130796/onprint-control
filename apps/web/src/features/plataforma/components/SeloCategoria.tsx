import type { CategoriaEmpresa } from '@onprint/shared'
import { cn } from '@/lib/utils'
import { CATEGORIA_SINGULAR, COR_CATEGORIA, PONTO_CATEGORIA } from './cores'

/** Situação comercial da empresa (uma categoria só: em dia, teste, cortesia, atraso, só leitura, bloqueada, cancelada). */
export function SeloCategoria({ categoria, grande, className }: { categoria: CategoriaEmpresa | null; grande?: boolean; className?: string }) {
  if (!categoria) return <span className="text-xs text-texto-secundario">sem assinatura</span>
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ring-1', grande ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs', COR_CATEGORIA[categoria], className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', categoria === 'bloqueada' ? 'bg-white' : PONTO_CATEGORIA[categoria])} aria-hidden="true" />
      {CATEGORIA_SINGULAR[categoria]}
    </span>
  )
}
