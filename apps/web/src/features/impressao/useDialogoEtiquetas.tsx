import { useState } from 'react'
import type { LoteEtiquetas } from './etiquetas'
import { ImprimirEtiquetasDialog } from './ImprimirEtiquetasDialog'

/** Abre o diálogo "Imprimir etiquetas" de qualquer tela: chamar `abrir(lotes)` e renderizar `dialogo`. */
export function useDialogoEtiquetas() {
  const [lotes, setLotes] = useState<LoteEtiquetas[] | null>(null)
  const dialogo = lotes ? <ImprimirEtiquetasDialog lotes={lotes} onFechar={() => setLotes(null)} /> : null
  return { abrir: setLotes, dialogo }
}
