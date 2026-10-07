import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import type { ColunaDef } from './Kanban'

interface ColunaKanbanProps<T> {
  coluna: ColunaDef<T>
  ids: string[]
  porId: Map<string, T>
  renderCartao: (item: T) => ReactNode
  podeArrastar?: (item: T) => boolean
  /** Durante um arraste: esta coluna não aceita o item */
  bloqueada: boolean
  /** Clique no cartão (fora de links e botões): abre o painel com detalhes e ações */
  onAbrir?: (item: T) => void
}

function CartaoArrastavel({ id, desabilitado, onAbrir, children }: { id: string; desabilitado: boolean; onAbrir?: () => void; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: desabilitado })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('touch-manipulation', isDragging && 'opacity-40', onAbrir ? 'cursor-pointer' : !desabilitado && 'cursor-grab')}
      onClick={(e) => {
        if (!onAbrir || (e.target as HTMLElement).closest('a, button, input')) return
        onAbrir()
      }}
      {...attributes}
      // O cartão contém links: "group" em vez de "button" evita controle interativo aninhado (teclado continua via tabIndex)
      role="group"
      {...listeners}
    >
      {children}
    </div>
  )
}

export function ColunaKanban<T>({ coluna, ids, porId, renderCartao, podeArrastar, bloqueada, onAbrir }: ColunaKanbanProps<T>) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.id })
  return (
    <section
      aria-label={coluna.titulo}
      className={cn('flex min-w-[300px] max-w-[460px] flex-1 flex-col rounded-2xl bg-slate-200/60 transition-opacity', bloqueada && 'opacity-40')}
    >
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: coluna.cor }} />
        <h2 className="text-sm font-semibold text-grafite">{coluna.titulo}</h2>
        <span className="rounded-full bg-white px-2 text-xs text-texto-secundario">{ids.length}</span>
        {coluna.extra && <span className="ml-auto text-xs text-texto-secundario">{coluna.extra}</span>}
      </header>
      <div
        ref={setNodeRef}
        className={cn('flex min-h-32 flex-1 flex-col gap-2.5 overflow-y-auto rounded-b-2xl p-2.5 transition-colors', isOver && !bloqueada && 'bg-marca/10')}
      >
        {ids.map((id) => {
          const item = porId.get(id)
          if (!item) return null
          return (
            <CartaoArrastavel key={id} id={id} desabilitado={podeArrastar ? !podeArrastar(item) : false} onAbrir={onAbrir ? () => onAbrir(item) : undefined}>
              {renderCartao(item)}
            </CartaoArrastavel>
          )
        })}
        {ids.length === 0 && <p className="py-6 text-center text-xs text-texto-secundario">Nada aqui</p>}
      </div>
    </section>
  )
}
