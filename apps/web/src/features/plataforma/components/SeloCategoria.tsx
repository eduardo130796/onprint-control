import { CATEGORIA_EMPRESA_ROTULOS, type CategoriaEmpresa } from '@onprint/shared'
import { cn } from '@/lib/utils'
import { COR_CATEGORIA } from './cores'

const SINGULAR: Record<CategoriaEmpresa, string> = { ...CATEGORIA_EMPRESA_ROTULOS, bloqueada: 'Bloqueada', cancelada: 'Cancelada' }

/** Situação comercial da empresa (uma categoria só: em dia, teste, aviso, só leitura, bloqueada, cancelada). */
export function SeloCategoria({ categoria, className }: { categoria: CategoriaEmpresa | null; className?: string }) {
  if (!categoria) return <span className="text-xs text-texto-secundario">sem assinatura</span>
  return <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold', COR_CATEGORIA[categoria], className)}>{SINGULAR[categoria]}</span>
}
