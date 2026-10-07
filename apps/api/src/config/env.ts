import { z } from 'zod'
import { duracaoEmMs } from '../core/duracao'

const duracao = (padrao: string) =>
  z
    .string()
    .regex(/^\d+[smhd]$/, 'Use o formato 15m, 1h, 7d…')
    .default(padrao)
    .transform((v) => ({ texto: v, ms: duracaoEmMs(v) }))

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3333),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url(),
  /** Conexões abertas por empresa (cada empresa tem o próprio pool) */
  DB_CONEXOES_POR_EMPRESA: z.coerce.number().int().min(1).max(20).default(3),
  /** Empresas com pool aberto ao mesmo tempo; as menos usadas são fechadas */
  DB_MAX_EMPRESAS_ABERTAS: z.coerce.number().int().min(1).default(60),
  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_EXPIRES: duracao('15m'),
  JWT_REFRESH_EXPIRES: duracao('7d'),
  APP_URL: z.string().url().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
  UPLOAD_MAX_MB: z.coerce.number().int().positive().default(200),
  TZ: z.string().default('America/Sao_Paulo'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
})

/** Em produção, segredos fracos ou de exemplo impedem a API de subir. */
const envProducao = envSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return
  for (const chave of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (env[chave].length < 32 || env[chave].includes('troque')) {
      ctx.addIssue({ code: 'custom', path: [chave], message: 'em produção use um segredo aleatório com 32+ caracteres (openssl rand -hex 32)' })
    }
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    ctx.addIssue({ code: 'custom', path: ['JWT_REFRESH_SECRET'], message: 'deve ser diferente de JWT_ACCESS_SECRET' })
  }
})

export type Env = z.infer<typeof envSchema>

export function carregarEnv(fonte: NodeJS.ProcessEnv = process.env): Env {
  const resultado = envProducao.safeParse(fonte)
  if (!resultado.success) {
    const erros = resultado.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Variáveis de ambiente inválidas:\n${erros}`)
  }
  return resultado.data
}
