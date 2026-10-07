/** Schema do PostgreSQL com os dados da plataforma (assinantes, índice de login). */
export const SCHEMA_PLATAFORMA = 'plataforma'

/** Schema da empresa criada antes da multiempresa (dados já existentes ficam onde estão). */
export const SCHEMA_LEGADO = 'public'

/** Nomes de schema aceitos: entram em SQL (CREATE SCHEMA), então só letras minúsculas, dígitos e _. */
export function schemaValido(schema: string): boolean {
  return /^[a-z][a-z0-9_]{0,62}$/.test(schema)
}

/** URL de conexão apontando para um schema (o Prisma usa o parâmetro "schema" como search_path). */
export function urlDoSchema(base: string, schema: string, conexoes?: number): string {
  if (!schemaValido(schema)) throw new Error(`Schema inválido: ${schema}`)
  const url = new URL(base)
  url.searchParams.set('schema', schema)
  if (conexoes) url.searchParams.set('connection_limit', String(conexoes))
  return url.toString()
}
