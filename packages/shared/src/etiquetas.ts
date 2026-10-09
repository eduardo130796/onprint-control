import { z } from 'zod'
import type { EtapaProducao } from './enums-producao'

// Etiquetas de entrega: formatos de papel, distribuição na folha e a fila de etiquetas a imprimir.

export const FORMATOS_ETIQUETA = ['a4-4', 'a4-8', 'termica-100x150'] as const
export type FormatoEtiqueta = (typeof FORMATOS_ETIQUETA)[number]

export interface DefinicaoFormatoEtiqueta {
  codigo: FormatoEtiqueta
  rotulo: string
  descricao: string
  /** Tamanho da página em milímetros */
  pagina: { largura: number; altura: number }
  colunas: number
  linhas: number
  porFolha: number
  /** Layout enxuto (sem arte nem canhoto) */
  compacta: boolean
  /** Rolo térmico: uma etiqueta por página, sem posição inicial */
  rolo: boolean
}

export const FORMATO_ETIQUETA: Record<FormatoEtiqueta, DefinicaoFormatoEtiqueta> = {
  'a4-4': {
    codigo: 'a4-4',
    rotulo: 'A4 · 4 por folha',
    descricao: 'Etiqueta completa 105 × 148 mm, com arte e canhoto de recebimento',
    pagina: { largura: 210, altura: 297 },
    colunas: 2,
    linhas: 2,
    porFolha: 4,
    compacta: false,
    rolo: false,
  },
  'a4-8': {
    codigo: 'a4-8',
    rotulo: 'A4 · 8 por folha',
    descricao: 'Etiqueta compacta 105 × 74 mm: cliente, endereço, pagamento e item',
    pagina: { largura: 210, altura: 297 },
    colunas: 2,
    linhas: 4,
    porFolha: 8,
    compacta: true,
    rolo: false,
  },
  'termica-100x150': {
    codigo: 'termica-100x150',
    rotulo: 'Térmica 100 × 150 mm',
    descricao: 'Uma etiqueta por página, para impressora térmica de rolo',
    pagina: { largura: 100, altura: 150 },
    colunas: 1,
    linhas: 1,
    porFolha: 1,
    compacta: false,
    rolo: true,
  },
}

export const FORMATO_ETIQUETA_PADRAO: FormatoEtiqueta = 'a4-4'

export const formatoEtiquetaValido = (v: unknown): v is FormatoEtiqueta => typeof v === 'string' && (FORMATOS_ETIQUETA as readonly string[]).includes(v)

/** Posição inicial válida (1 a N da folha); no rolo é sempre 1. */
export function posicaoInicialValida(formato: FormatoEtiqueta, inicio: number): number {
  const { porFolha } = FORMATO_ETIQUETA[formato]
  if (!Number.isFinite(inicio)) return 1
  return Math.min(porFolha, Math.max(1, Math.trunc(inicio)))
}

export interface DistribuicaoEtiquetas {
  /** Cada página: uma casa por posição da folha com o índice da etiqueta (0-based) ou null (em branco) */
  paginas: (number | null)[][]
  folhas: number
  /** Casas em branco no fim da última folha (aproveitáveis numa próxima impressão) */
  sobram: number
  /** Posição (1-based) para começar a próxima impressão na mesma folha; null = folha nova */
  proximaPosicao: number | null
}

/**
 * Distribui `qtd` etiquetas nas folhas do formato, começando na casa `inicio` (1-based) da primeira folha
 * — as casas anteriores ficam em branco para aproveitar uma folha já usada.
 */
export function distribuirEtiquetas(qtd: number, formato: FormatoEtiqueta, inicio = 1): DistribuicaoEtiquetas {
  const { porFolha } = FORMATO_ETIQUETA[formato]
  const total = Math.max(0, Math.trunc(qtd))
  if (total === 0) return { paginas: [], folhas: 0, sobram: 0, proximaPosicao: null }
  const pulo = posicaoInicialValida(formato, inicio) - 1
  const casas = pulo + total
  const folhas = Math.ceil(casas / porFolha)
  const paginas = Array.from({ length: folhas }, (_, f) =>
    Array.from({ length: porFolha }, (_, c) => {
      const indice = f * porFolha + c - pulo
      return indice >= 0 && indice < total ? indice : null
    }),
  )
  const sobram = folhas * porFolha - casas
  return { paginas, folhas, sobram, proximaPosicao: sobram > 0 ? porFolha - sobram + 1 : null }
}

/** "Faltam N para completar a folha" (0 = fecha folhas inteiras). */
export function faltamParaCompletar(qtd: number, formato: FormatoEtiqueta, inicio = 1): number {
  return distribuirEtiquetas(qtd, formato, inicio).sobram
}

// ─── Fila de etiquetas (API) ────────────────────────────────────────────────

const ids = z.array(z.string().uuid()).max(500)

export const filaEtiquetasAdicionarSchema = z
  .object({
    /** OPs a etiquetar */
    opIds: ids.default([]),
    /** Pedidos inteiros (todas as OPs ativas) */
    pedidoIds: ids.default([]),
  })
  .refine((d) => d.opIds.length + d.pedidoIds.length > 0, { message: 'Escolha ao menos uma OP ou pedido.' })
export type FilaEtiquetasAdicionarInput = z.input<typeof filaEtiquetasAdicionarSchema>

export const filaEtiquetasIdsSchema = z.object({ ids: ids.min(1, 'Escolha ao menos uma etiqueta.') })
export type FilaEtiquetasIdsInput = z.input<typeof filaEtiquetasIdsSchema>

/** Etiqueta pendente na fila (uma por OP). */
export interface EtiquetaFilaItem {
  id: string
  ordemProducaoId: string
  pedidoId: string
  criadaEm: string
  /** Entrou sozinha ao concluir a OP (false = adicionada por alguém) */
  automatica: boolean
  op: { numero: string; quantidade: string; etapaAtual: EtapaProducao }
  pedido: { numero: string; cliente: string }
  item: string
}
