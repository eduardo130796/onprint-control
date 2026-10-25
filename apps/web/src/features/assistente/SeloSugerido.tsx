import { Sparkles } from 'lucide-react'
import { NOME_ASSISTENTE } from '@onprint/shared'
import { cn } from '@/lib/utils'

/** "✨ sugerido pelo Assistente": fica no que o Assistente preencheu até a pessoa mexer ou salvar */
export function SeloSugerido({ className, curto }: { className?: string; curto?: boolean }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 rounded-full bg-marca-suave px-2 py-0.5 text-[0.6875rem] font-medium text-marca-escuro', className)}
      title={`Preenchido pelo ${NOME_ASSISTENTE}: confira antes de salvar`}
    >
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      {curto ? 'sugerido' : 'sugerido pelo Assistente'}
    </span>
  )
}
