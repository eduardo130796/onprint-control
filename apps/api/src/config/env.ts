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
  /** Por quanto tempo a empresa e a assinatura ficam em cache (0 = sempre consulta; usado nos testes) */
  CACHE_EMPRESAS_SEGUNDOS: z.coerce.number().int().min(0).default(30),
  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_EXPIRES: duracao('15m'),
  JWT_REFRESH_EXPIRES: duracao('7d'),
  APP_URL: z.string().url().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
  UPLOAD_MAX_MB: z.coerce.number().int().positive().default(200),
  TZ: z.string().default('America/Sao_Paulo'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** SMTP de qualquer provedor; sem SMTP_HOST, os e-mails só vão para o log */
  SMTP_HOST: z.string().default(''),
  SMTP_PORTA: z.coerce.number().int().default(587),
  /** true para a porta 465 (TLS direto); na 587 o TLS é negociado (STARTTLS) */
  SMTP_SEGURO: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  SMTP_USUARIO: z.string().default(''),
  SMTP_SENHA: z.string().default(''),
  EMAIL_REMETENTE: z.string().default('ONPrint Control <nao-responda@onprint.local>'),
  /** Desenvolvimento/testes: também grava cada e-mail como JSON nesta pasta */
  EMAIL_PASTA: z.string().default(''),
  /** Contato do suporte mostrado em "Minha assinatura" (WhatsApp, e-mail…) */
  SUPORTE_CONTATO: z.string().default(''),
  /** Asaas: sem chave, o pagamento online fica desligado (modo manual, o suporte registra as cobranças) */
  ASAAS_API_KEY: z.string().default(''),
  ASAAS_AMBIENTE: z.enum(['sandbox', 'producao']).default('sandbox'),
  /** Só para testes (servidor falso); vazio = endereço oficial do ambiente */
  ASAAS_API_URL: z.string().default(''),
  /** Token que o Asaas manda no cabeçalho asaas-access-token de cada webhook */
  ASAAS_WEBHOOK_TOKEN: z.string().default(''),
  /** NFS-e automática da mensalidade (a conta Asaas precisa estar habilitada para notas) */
  ASAAS_NF_ATIVA: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  ASAAS_NF_SERVICO_ID: z.string().default(''),
  ASAAS_NF_SERVICO_CODIGO: z.string().default(''),
  ASAAS_NF_SERVICO_NOME: z.string().default('Licença de uso de software (ONPrint Control)'),
  ASAAS_NF_OBSERVACOES: z.string().default(''),
  ASAAS_NF_RETER_ISS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  /** Alíquotas em % (Simples Nacional normalmente só o ISS) */
  ASAAS_NF_ISS: z.coerce.number().min(0).default(0),
  ASAAS_NF_PIS: z.coerce.number().min(0).default(0),
  ASAAS_NF_COFINS: z.coerce.number().min(0).default(0),
  ASAAS_NF_CSLL: z.coerce.number().min(0).default(0),
  ASAAS_NF_INSS: z.coerce.number().min(0).default(0),
  ASAAS_NF_IR: z.coerce.number().min(0).default(0),
})

/** Em produção, segredos fracos ou de exemplo impedem a API de subir. */
const envProducao = envSchema.superRefine((env, ctx) => {
  // Com o Asaas ligado, o webhook precisa de um token forte (senão qualquer um "confirma" pagamentos)
  if (env.ASAAS_API_KEY && env.ASAAS_WEBHOOK_TOKEN.length < 32) {
    ctx.addIssue({ code: 'custom', path: ['ASAAS_WEBHOOK_TOKEN'], message: 'com ASAAS_API_KEY, defina um token de webhook com 32+ caracteres (openssl rand -hex 32)' })
  }
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
