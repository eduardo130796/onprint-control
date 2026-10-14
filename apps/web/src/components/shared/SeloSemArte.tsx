import { cn } from '@/lib/utils'

/** Item que não precisa de arte: no lugar do status da arte (não trava o pedido nem a OP). */
export function SeloSemArte({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-fundo px-2.5 py-0.5 text-xs font-medium text-texto-secundario', className)}
      title="Este item não precisa de arte: segue direto para a produção"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-texto-secundario" />
      Sem arte
    </span>
  )
}
