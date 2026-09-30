import { Link } from 'react-router-dom'
import { CalendarClock, Cpu, ImageOff, User } from 'lucide-react'
import { formatarDataSimples, type OrdemProducao } from '@onprint/shared'
import { SeloAtraso, SeloPrioridade } from '@/components/shared/Selos'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { cn } from '@/lib/utils'

/** Cartão da OP no kanban: miniatura da arte, cliente, item, prazo, máquina e responsável. */
export function CartaoOp({ op }: { op: OrdemProducao }) {
  const prazo = op.dataFimPrevista ?? op.pedido.dataPrevistaEntrega
  return (
    <article className={cn('rounded-xl border bg-card p-3 text-sm shadow-sm', op.atrasada ? 'border-coral/60' : 'border-transparent')}>
      <div className="flex gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-fundo">
          {op.arte?.miniaturaUrl ? (
            <img src={op.arte.miniaturaUrl} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
          ) : (
            <ImageOff className="h-5 w-5 text-texto-secundario" aria-label="Sem miniatura" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Link
              to={`/producao/ordens/${op.id}`}
              className="font-mono text-xs font-semibold text-petroleo hover:underline"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {op.numero}
            </Link>
            <span className="font-mono text-[11px] text-texto-secundario">{op.pedido.numero}</span>
          </div>
          <p className="truncate font-medium" title={op.pedido.cliente.nome}>
            {op.pedido.cliente.nome}
          </p>
          <p className="truncate text-xs text-texto-secundario" title={op.item.descricao}>
            {Number(op.quantidade).toLocaleString('pt-BR')} × {op.item.descricao}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {op.atrasada && <SeloAtraso />}
        <SeloPrioridade prioridade={op.prioridade} />
        <StatusBadge entidade="arte" codigo={op.arte?.status ?? 'aguardando_arquivo'} className="text-[11px]" />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-texto-secundario">
        <span className={cn('inline-flex items-center gap-1', op.atrasada && 'font-medium text-coral-escuro')}>
          <CalendarClock className="h-3 w-3" /> {formatarDataSimples(prazo)}
        </span>
        {op.maquina && (
          <span className="inline-flex items-center gap-1">
            <Cpu className="h-3 w-3" /> {op.maquina.nome}
          </span>
        )}
        {op.responsavel && (
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3" /> {op.responsavel.nome.split(' ')[0]}
          </span>
        )}
      </div>
    </article>
  )
}
