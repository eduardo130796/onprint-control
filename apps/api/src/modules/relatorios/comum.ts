import { Prisma, type PrismaClient } from '@prisma/client'
import type { ColunaRelatorio, FormatoValor, Relatorio } from '@onprint/shared'

export const FUSO = 'America/Sao_Paulo'
export const n = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100

/** Data local (São Paulo) de uma coluna timestamptz dentro do período. */
export const noPeriodo = (coluna: Prisma.Sql, de: string, ate: string) => Prisma.sql`(${coluna} AT TIME ZONE ${FUSO})::date BETWEEN ${de}::date AND ${ate}::date`

export interface Contexto {
  prisma: PrismaClient
  de: string
  ate: string
  /** Vê custos (produtos:editar): linhas de custo nos relatórios (ex.: custo dos materiais na DRE) */
  veCustos?: boolean
}

export const col = (chave: string, titulo: string, formato: FormatoValor = 'texto'): ColunaRelatorio => ({ chave, titulo, formato })

/** Converte linhas do SQL (bigint/Decimal) para números com 2 casas nas colunas numéricas. */
export function normalizar(linhas: Record<string, unknown>[], colunas: ColunaRelatorio[]) {
  return linhas.map((l) =>
    Object.fromEntries(
      colunas.map((c) => {
        const v = l[c.chave]
        if (v === null || v === undefined) return [c.chave, null]
        if (c.formato === 'texto') return [c.chave, String(v)]
        if (c.formato === 'data') return [c.chave, v instanceof Date ? v.toISOString().slice(0, 10) : String(v)]
        return [c.chave, n(v)]
      }),
    ),
  )
}

export function relatorio(r: Omit<Relatorio, 'linhas'> & { linhas: Record<string, unknown>[] }): Relatorio {
  return { ...r, linhas: normalizar(r.linhas, r.colunas) }
}

export const soma = (linhas: Record<string, unknown>[], chave: string) => n(linhas.reduce((s, l) => s + Number(l[chave] ?? 0), 0))
