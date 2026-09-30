import { z } from 'zod'

/** Formato padrão de erro da API. */
export const erroApiSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
})
export type ErroApi = z.infer<typeof erroApiSchema>

/** Query padrão de listagens: ?page=1&pageSize=20&sort=campo:asc&busca=texto */
export const paginacaoQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z
    .string()
    .regex(/^[a-zA-Z_]+:(asc|desc)$/, 'Use o formato campo:asc ou campo:desc.')
    .optional(),
  busca: z.string().trim().optional(),
})
export type PaginacaoQuery = z.infer<typeof paginacaoQuerySchema>

export interface Paginado<T> {
  data: T[]
  meta: { page: number; pageSize: number; total: number }
}

export const idParamSchema = z.object({ id: z.string().uuid('Identificador inválido.') })
