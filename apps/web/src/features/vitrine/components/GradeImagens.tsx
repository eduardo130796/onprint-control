import { useRef, useState } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { EXTENSOES_FOTO, TAMANHO_MAX_FOTO_MB } from '../utils'

export interface ImagemGrade {
  id: string
  url: string
}

interface GradeImagensProps<T extends ImagemGrade> {
  itens: T[]
  /** Quantidade máxima de imagens */
  maximo: number
  podeEditar: boolean
  /** Proporção das miniaturas: quadrada (fotos de produto) ou larga (banners) */
  formato?: 'quadrado' | 'banner'
  /** Selo da primeira imagem (ex.: "Capa") */
  rotuloPrimeira?: string
  textoAdicionar: string
  onEnviar: (arquivo: File, aoProgredir: (pct: number) => void) => Promise<unknown>
  onRemover: (item: T) => Promise<unknown>
  onReordenar: (ids: string[]) => Promise<unknown>
}

/**
 * Grade de imagens com arrastar para ordenar (@dnd-kit: mouse, toque segurando ou teclado), envio de várias fotos
 * de uma vez (clique ou soltar arquivos) e remoção. A ordem local muda na hora; se a API recusar, volta.
 */
export function GradeImagens<T extends ImagemGrade>(props: GradeImagensProps<T>) {
  // Recria o estado local quando a lista vinda da API muda (nova foto, remoção, outra ordem)
  return <Grade key={props.itens.map((i) => i.id).join('|')} {...props} />
}

function Grade<T extends ImagemGrade>({ itens, maximo, podeEditar, formato = 'quadrado', rotuloPrimeira, textoAdicionar, onEnviar, onRemover, onReordenar }: GradeImagensProps<T>) {
  const [ordem, setOrdem] = useState(itens)
  const [enviando, setEnviando] = useState<{ nome: string; pct: number; resta: number } | null>(null)
  const [removendo, setRemovendo] = useState<string | null>(null)
  const [arrastandoArquivo, setArrastandoArquivo] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const vagas = maximo - ordem.length
  const ocupado = enviando !== null || removendo !== null

  async function aoSoltar({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const antes = ordem
    const de = antes.findIndex((i) => i.id === active.id)
    const para = antes.findIndex((i) => i.id === over.id)
    const nova = arrayMove(antes, de, para)
    setOrdem(nova)
    try {
      await onReordenar(nova.map((i) => i.id))
    } catch (e) {
      setOrdem(antes)
      toast.error((e as Error).message)
    }
  }

  async function enviar(lista: FileList | null) {
    if (!lista?.length) return
    const arquivos = Array.from(lista)
    const validos = arquivos.filter((a) => {
      const ext = a.name.split('.').pop()?.toLowerCase() ?? ''
      if (!(EXTENSOES_FOTO as readonly string[]).includes(ext)) {
        toast.error(`${a.name}: use ${EXTENSOES_FOTO.join(', ').toUpperCase()}.`)
        return false
      }
      if (a.size > TAMANHO_MAX_FOTO_MB * 1024 * 1024) {
        toast.error(`${a.name}: maior que ${TAMANHO_MAX_FOTO_MB} MB.`)
        return false
      }
      return true
    })
    if (validos.length > vagas) toast.warning(`Cabem só mais ${vagas} ${vagas === 1 ? 'imagem' : 'imagens'}; as demais ficaram de fora.`)
    const fila = validos.slice(0, Math.max(vagas, 0))
    try {
      for (const [i, arquivo] of fila.entries()) {
        setEnviando({ nome: arquivo.name, pct: 0, resta: fila.length - i - 1 })
        await onEnviar(arquivo, (pct) => setEnviando((e) => (e ? { ...e, pct } : e)))
      }
      if (fila.length) toast.success(fila.length === 1 ? 'Imagem enviada.' : `${fila.length} imagens enviadas.`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setEnviando(null)
      if (input.current) input.current.value = ''
    }
  }

  async function remover(item: T) {
    setRemovendo(item.id)
    try {
      await onRemover(item)
      toast.success('Imagem removida.')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRemovendo(null)
    }
  }

  const grade = formato === 'banner' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-1' : 'grid-cols-3 sm:grid-cols-4'
  const proporcao = formato === 'banner' ? 'aspect-[3/1]' : 'aspect-square'
  const podeAdicionar = podeEditar && vagas > 0

  return (
    <div
      onDragOver={(e) => {
        if (!podeAdicionar || ocupado || !e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setArrastandoArquivo(true)
      }}
      onDragLeave={() => setArrastandoArquivo(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        setArrastandoArquivo(false)
        if (podeAdicionar && !ocupado) void enviar(e.dataTransfer.files)
      }}
      className={cn('rounded-2xl transition-shadow', arrastandoArquivo && 'ring-2 ring-marca ring-offset-4 ring-offset-card')}
    >
      <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={(e) => void aoSoltar(e)}>
        <SortableContext items={ordem.map((i) => i.id)} strategy={rectSortingStrategy}>
          <ul className={cn('grid gap-3', grade)}>
            {ordem.map((item, i) => (
              <ItemOrdenavel
                key={item.id}
                item={item}
                posicao={i}
                total={ordem.length}
                proporcao={proporcao}
                selo={i === 0 ? rotuloPrimeira : undefined}
                podeEditar={podeEditar && !ocupado}
                removendo={removendo === item.id}
                onRemover={() => void remover(item)}
              />
            ))}
            {podeAdicionar && (
              <li>
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  disabled={ocupado}
                  className={cn(
                    'flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-fundo/50 p-3 text-center text-xs font-medium text-texto-secundario transition-colors hover:border-marca hover:bg-marca-suave hover:text-marca-escuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait',
                    proporcao,
                  )}
                >
                  {enviando ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-marca-escuro" />
                      <span className="tabular-nums">{enviando.pct}%</span>
                      {enviando.resta > 0 && <span className="text-[0.6875rem]">+{enviando.resta} na fila</span>}
                    </>
                  ) : (
                    <>
                      <ImagePlus className="h-6 w-6" />
                      <span className="leading-tight">{textoAdicionar}</span>
                    </>
                  )}
                </button>
              </li>
            )}
          </ul>
        </SortableContext>
      </DndContext>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        accept={EXTENSOES_FOTO.map((e) => `.${e}`).join(',')}
        onChange={(e) => void enviar(e.target.files)}
      />
      <p className="mt-3 text-xs text-texto-secundario">
        {ordem.length}/{maximo} · {EXTENSOES_FOTO.join(', ').toUpperCase()} até {TAMANHO_MAX_FOTO_MB} MB
        {podeEditar && ordem.length > 1 && ' · Arraste para mudar a ordem'}
      </p>
    </div>
  )
}

interface ItemOrdenavelProps {
  item: ImagemGrade
  posicao: number
  total: number
  proporcao: string
  selo?: string
  podeEditar: boolean
  removendo: boolean
  onRemover: () => void
}

function ItemOrdenavel({ item, posicao, total, proporcao, selo, podeEditar, removendo, onRemover }: ItemOrdenavelProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !podeEditar })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group relative overflow-hidden rounded-xl bg-fundo ring-1 ring-border', proporcao, isDragging && 'z-10 shadow-suave ring-2 ring-marca')}
    >
      <img src={item.url} alt={`Imagem ${posicao + 1} de ${total}`} className="h-full w-full select-none object-cover" draggable={false} />
      {selo && <span className="absolute left-2 top-2 rounded-full bg-grafite/85 px-2 py-0.5 text-[0.6875rem] font-semibold text-white backdrop-blur">{selo}</span>}
      {podeEditar && (
        <>
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Mover imagem ${posicao + 1}`}
            className="absolute bottom-2 left-2 flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded-lg bg-white/90 text-black/70 shadow-sm active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRemover}
            disabled={removendo}
            aria-label={`Remover imagem ${posicao + 1}`}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-[#DC2626] shadow-sm transition-opacity hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          >
            {removendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </>
      )}
    </li>
  )
}
