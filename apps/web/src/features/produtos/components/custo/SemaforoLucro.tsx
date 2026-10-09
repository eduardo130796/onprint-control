import type { SituacaoLucro } from '@onprint/shared'
import { cn } from '@/lib/utils'
import { SITUACAO_LUCRO, textoSituacao } from '../../custos'

/** Selo do lucro: verde (em dia), âmbar (abaixo do mínimo), vermelho (prejuízo), cinza (sem custo). */
export function SemaforoLucro({ situacao, lucroPercentual, className }: { situacao: SituacaoLucro; lucroPercentual?: string | null; className?: string }) {
  const s = SITUACAO_LUCRO[situacao]
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', s.classe, className)} title={s.rotulo}>
      <span className={cn('h-2 w-2 rounded-full', s.ponto)} aria-hidden="true" />
      {lucroPercentual === undefined ? s.rotulo : textoSituacao(situacao, lucroPercentual)}
    </span>
  )
}
