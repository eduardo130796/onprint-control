import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ColunaKanban } from './ColunaKanban'

export interface ColunaDef<T> {
  id: string
  titulo: string
  cor: string
  itens: T[]
  /** Texto extra no cabeçalho (ex.: horas somadas) */
  extra?: ReactNode
}

interface KanbanProps<T> {
  colunas: ColunaDef<T>[]
  idDe: (item: T) => string
  renderCartao: (item: T) => ReactNode
  podeArrastar?: (item: T) => boolean
  /** Coluna aceita o item? (ex.: transições manuais do pedido) */
  podeSoltar?: (item: T, destino: string) => boolean
  /** Chamado ao soltar em outra posição/coluna; se rejeitar, o quadro volta ao estado anterior. */
  onMover: (item: T, destino: string, ordemIds: string[]) => Promise<unknown>
  /** false: a ordem dentro da coluna não é salva (só muda de coluna) */
  reordenavel?: boolean
}

type Mapa = Record<string, string[]>

/**
 * Colisão pelo ponteiro (coluna ou cartão sob o cursor); sem ponteiro (teclado), pela área.
 * O closestCorners padrão erra com colunas altas: o cartão vizinho "ganha" da coluna de destino.
 */
const colisao: CollisionDetection = (args) => {
  const sobPonteiro = pointerWithin(args)
  return sobPonteiro.length > 0 ? sobPonteiro : rectIntersection(args)
}

const montarMapa = <T,>(colunas: ColunaDef<T>[], idDe: (i: T) => string): Mapa =>
  Object.fromEntries(colunas.map((c) => [c.id, c.itens.map(idDe)]))

/**
 * Quadro kanban genérico (@dnd-kit): arrastar com mouse, toque (segurar) ou teclado (espaço + setas).
 * O estado local só existe durante o arraste; a verdade vem sempre da API (refetch/tempo real).
 */
export function Kanban<T>({ colunas, idDe, renderCartao, podeArrastar, podeSoltar, onMover, reordenavel = true }: KanbanProps<T>) {
  const [mapa, setMapa] = useState<Mapa>(() => montarMapa(colunas, idDe))
  const [ativoId, setAtivoId] = useState<string | null>(null)
  const origem = useRef<string | null>(null)
  const porId = useMemo(() => new Map(colunas.flatMap((c) => c.itens.map((i) => [idDe(i), i] as const))), [colunas, idDe])

  // Dados novos da API (inclusive via tempo real) substituem o estado local, exceto durante um arraste
  useEffect(() => {
    if (!ativoId) setMapa(montarMapa(colunas, idDe))
  }, [colunas, idDe, ativoId])

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const colunaDe = (id: string, m: Mapa = mapa) => (id in m ? id : Object.keys(m).find((c) => m[c]!.includes(id)))

  function aoIniciar({ active }: DragStartEvent) {
    setAtivoId(String(active.id))
    origem.current = colunaDe(String(active.id)) ?? null
  }

  function aoPassar({ active, over }: DragOverEvent) {
    if (!over) return
    const de = colunaDe(String(active.id))
    const para = colunaDe(String(over.id))
    const item = porId.get(String(active.id))
    if (!de || !para || de === para || !item) return
    if (para !== origem.current && podeSoltar && !podeSoltar(item, para)) return
    setMapa((m) => {
      const destino = m[para]!.filter((id) => id !== active.id)
      const indice = over.id in m ? destino.length : Math.max(0, destino.indexOf(String(over.id)))
      destino.splice(indice, 0, String(active.id))
      return { ...m, [de]: m[de]!.filter((id) => id !== active.id), [para]: destino }
    })
  }

  async function aoSoltar({ active, over }: DragEndEvent) {
    const id = String(active.id)
    const item = porId.get(id)
    let final = mapa
    const coluna = colunaDe(id)
    if (over && coluna && colunaDe(String(over.id)) === coluna && over.id !== id) {
      const lista = mapa[coluna]!
      final = { ...mapa, [coluna]: arrayMove(lista, lista.indexOf(id), lista.indexOf(String(over.id))) }
      setMapa(final)
    }
    const inicial = montarMapa(colunas, idDe)
    const mudouColuna = coluna !== origem.current
    const mudou = coluna && (mudouColuna || (reordenavel && final[coluna]!.join() !== inicial[coluna]?.join()))
    setAtivoId(null)
    if (!item || !coluna || !mudou) return setMapa(inicial)
    try {
      await onMover(item, coluna, final[coluna]!)
    } catch {
      setMapa(inicial)
    }
  }

  const ativo = ativoId ? porId.get(ativoId) : undefined
  return (
    <DndContext
      sensors={sensores}
      collisionDetection={colisao}
      onDragStart={aoIniciar}
      onDragOver={aoPassar}
      onDragEnd={(e) => void aoSoltar(e)}
      onDragCancel={() => {
        setAtivoId(null)
        setMapa(montarMapa(colunas, idDe))
      }}
    >
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        {colunas.map((c) => {
          const bloqueada = Boolean(ativo && podeSoltar && c.id !== origem.current && !podeSoltar(ativo, c.id))
          return (
            <SortableContext key={c.id} id={c.id} items={mapa[c.id] ?? []} strategy={verticalListSortingStrategy}>
              <ColunaKanban
                coluna={c}
                ids={mapa[c.id] ?? []}
                porId={porId}
                renderCartao={renderCartao}
                podeArrastar={podeArrastar}
                bloqueada={bloqueada}
              />
            </SortableContext>
          )
        })}
      </div>
      <DragOverlay>{ativo ? <div className="rotate-1 cursor-grabbing opacity-95 shadow-lg">{renderCartao(ativo)}</div> : null}</DragOverlay>
    </DndContext>
  )
}
