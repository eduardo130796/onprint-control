import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { schemaValido, urlDoSchema } from '../core/banco'

/** Pasta do Prisma: os scripts e a API rodam a partir de apps/api (dev e imagem de produção). */
const PASTA_PRISMA = join(process.cwd(), 'prisma')

async function migracoesLocais(): Promise<number> {
  const entradas = await readdir(join(PASTA_PRISMA, 'migrations'), { withFileTypes: true })
  return entradas.filter((e) => e.isDirectory()).length
}

/** Quantas migrations já foram aplicadas no schema (0 se o schema ainda não tem a tabela de controle). */
async function migracoesAplicadas(banco: PrismaClient, schema: string): Promise<number> {
  const [tabela] = await banco.$queryRaw<{ existe: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = ${schema} AND table_name = '_prisma_migrations') AS existe`
  if (!tabela?.existe) return 0
  const [linha] = await banco.$queryRawUnsafe<{ total: number }[]>(
    `SELECT count(*)::int AS total FROM "${schema}"._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
  )
  return linha?.total ?? 0
}

function rodarPrismaMigrate(databaseUrl: string, schema: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const processo = spawn('npx', ['prisma', 'migrate', 'deploy', '--schema', join(PASTA_PRISMA, 'schema.prisma')], {
      env: { ...process.env, DATABASE_URL: urlDoSchema(databaseUrl, schema), PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let saida = ''
    processo.stdout.on('data', (d: Buffer) => (saida += d.toString()))
    processo.stderr.on('data', (d: Buffer) => (saida += d.toString()))
    processo.on('error', reject)
    processo.on('close', (codigo) => (codigo === 0 ? resolve() : reject(new Error(`prisma migrate deploy falhou no schema ${schema}:\n${saida}`))))
  })
}

/**
 * Cria o schema (se preciso) e aplica as migrations pendentes nele.
 * `banco` é qualquer conexão com o banco (só consulta o catálogo). Devolve true se aplicou algo.
 */
export async function migrarSchema(banco: PrismaClient, databaseUrl: string, schema: string): Promise<boolean> {
  if (!schemaValido(schema)) throw new Error(`Schema inválido: ${schema}`)
  await banco.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`)
  if ((await migracoesAplicadas(banco, schema)) >= (await migracoesLocais())) return false
  await rodarPrismaMigrate(databaseUrl, schema)
  return true
}
