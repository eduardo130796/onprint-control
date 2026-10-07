import { PrismaClient } from '@prisma/client'
import { SCHEMA_PLATAFORMA, urlDoSchema } from '../src/core/banco'

/** Conexões para os scripts de linha de comando (migrar, seed, criar empresa, reset). */
export function conexoesDosScripts() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL não definida.')
  const clientes = new Map<string, PrismaClient>()
  const clienteDe = (schema: string) => {
    let cliente = clientes.get(schema)
    if (!cliente) {
      cliente = new PrismaClient({ datasourceUrl: urlDoSchema(url, schema, 2) })
      clientes.set(schema, cliente)
    }
    return cliente
  }
  return {
    url,
    plataforma: clienteDe(SCHEMA_PLATAFORMA),
    clienteDe,
    fechar: () => Promise.all([...clientes.values()].map((c) => c.$disconnect())),
  }
}

/** Executa o script e encerra o processo com código de erro se falhar. */
export function executarScript(principal: () => Promise<void>, fechar: () => Promise<unknown>) {
  principal()
    .catch((erro: unknown) => {
      console.error(erro instanceof Error ? erro.message : erro)
      process.exitCode = 1
    })
    .finally(() => void fechar())
}
