import { useState } from 'react'
import { ListPlus, Loader2, Tags, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BarraSelecaoEtiquetasProps {
  quantidade: number
  /** "selecionadas" (OPs) ou "selecionados" (pedidos/entregas) */
  rotulo?: string
  onImprimir: () => void
  /** Ausente para quem não vê a produção (a fila é da produção) */
  onFila?: () => Promise<unknown>
  onLimpar: () => void
}

/** Barra flutuante do modo seleção: imprime as etiquetas de tudo que foi marcado ou manda para a fila. */
export function BarraSelecaoEtiquetas({ quantidade, rotulo = 'selecionadas', onImprimir, onFila, onLimpar }: BarraSelecaoEtiquetasProps) {
  const [enviando, setEnviando] = useState(false)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 sm:bottom-6">
      <div role="toolbar" aria-label="Seleção" className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-3xl bg-grafite px-4 py-3 text-white shadow-2xl">
        <span className="mr-1 text-sm font-semibold">
          <span className="mr-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-marca px-1.5 text-xs font-bold text-marca-contraste">{quantidade}</span>
          {rotulo}
        </span>
        <Button size="sm" disabled={quantidade === 0} onClick={onImprimir}>
          <Tags /> Imprimir etiquetas
        </Button>
        {onFila && (
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/10"
            disabled={quantidade === 0 || enviando}
            onClick={async () => {
              setEnviando(true)
              await onFila()
              setEnviando(false)
            }}
          >
            {enviando ? <Loader2 className="animate-spin" /> : <ListPlus />} Adicionar à fila
          </Button>
        )}
        <Button size="sm" variant="ghost" className="text-white/80 hover:bg-white/10 hover:text-white" onClick={onLimpar}>
          <X /> Limpar
        </Button>
      </div>
    </div>
  )
}
