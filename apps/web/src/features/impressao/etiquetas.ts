import { FORMATO_ETIQUETA_PADRAO, formatoEtiquetaValido, type FormatoEtiqueta, type PedidoDetalhe, type PedidoItemDetalhe } from '@onprint/shared'

// Etiquetas de entrega sem a biblioteca de PDF: quais volumes cada pedido tem e as preferências salvas no navegador.

/** O que etiquetar: o pedido inteiro ou só algumas OPs dele. */
export interface LoteEtiquetas {
  pedidoId: string
  opIds?: string[]
}

/** Um volume do pedido = uma etiqueta (uma por OP ativa; item sem OP vira um volume só). */
export interface VolumeEtiqueta {
  /** id da OP, ou "item:<id>" quando o item não tem OP */
  chave: string
  item: PedidoItemDetalhe
  op: { id: string; numero: string } | null
  /** Etiqueta N de T (contando todos os volumes do pedido) */
  indice: number
  total: number
}

export function volumesDoPedido(p: PedidoDetalhe): VolumeEtiqueta[] {
  const todos = p.itens.flatMap((item): Omit<VolumeEtiqueta, 'chave' | 'indice' | 'total'>[] => {
    const ops = item.ordensProducao.filter((o) => !o.cancelada)
    return ops.length > 0 ? ops.map((op) => ({ item, op: { id: op.id, numero: op.numero } })) : [{ item, op: null }]
  })
  return todos.map((v, i) => ({ ...v, chave: v.op?.id ?? `item:${v.item.id}`, indice: i + 1, total: todos.length }))
}

/** Volumes marcados ao abrir: os das OPs pedidas ou, sem lista, todos. */
export function chavesDoLote(p: PedidoDetalhe, opIds?: string[]): string[] {
  const volumes = volumesDoPedido(p)
  return (opIds ? volumes.filter((v) => v.op && opIds.includes(v.op.id)) : volumes).map((v) => v.chave)
}

// Preferências (por navegador). O acesso ao localStorage pode falhar (aba anônima, bloqueio): nunca quebra a tela.
const CHAVE_FORMATO = 'onprint:etiquetas:formato'
const chaveSobra = (f: FormatoEtiqueta) => `onprint:etiquetas:proxima:${f}`

export function formatoSalvo(): FormatoEtiqueta {
  try {
    const v = localStorage.getItem(CHAVE_FORMATO)
    return formatoEtiquetaValido(v) ? v : FORMATO_ETIQUETA_PADRAO
  } catch {
    return FORMATO_ETIQUETA_PADRAO
  }
}

export function salvarFormato(f: FormatoEtiqueta) {
  try {
    localStorage.setItem(CHAVE_FORMATO, f)
  } catch {
    // sem armazenamento: só não lembra na próxima vez
  }
}

/** Posição onde a última folha impressa parou (para aproveitar o resto da folha). */
export function proximaPosicaoSalva(f: FormatoEtiqueta): number | null {
  try {
    const n = Number(localStorage.getItem(chaveSobra(f)))
    return Number.isInteger(n) && n > 1 ? n : null
  } catch {
    return null
  }
}

export function salvarProximaPosicao(f: FormatoEtiqueta, posicao: number | null) {
  try {
    if (posicao && posicao > 1) localStorage.setItem(chaveSobra(f), String(posicao))
    else localStorage.removeItem(chaveSobra(f))
  } catch {
    // idem
  }
}
