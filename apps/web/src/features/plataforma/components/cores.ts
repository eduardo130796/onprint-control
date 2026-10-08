import type { CategoriaEmpresa } from '@onprint/shared'

/** Cor de cada situação comercial (selos e indicadores do painel). */
export const COR_CATEGORIA: Record<CategoriaEmpresa, string> = {
  em_dia: 'bg-green-100 text-green-800',
  teste: 'bg-sky-100 text-sky-900',
  aviso: 'bg-amber-100 text-amber-900',
  somente_leitura: 'bg-coral/10 text-coral-escuro',
  bloqueada: 'bg-grafite text-white',
  cancelada: 'bg-slate-200 text-texto-secundario',
}
