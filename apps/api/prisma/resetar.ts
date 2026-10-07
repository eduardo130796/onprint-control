/**
 * Apaga TODOS os dados locais: schema da plataforma, schemas das empresas e o schema public.
 * Depois, o npm run prisma:reset aplica as migrations e o seed de novo. Recusado em produção.
 */
import { conexoesDosScripts, executarScript } from './scripts-banco'

if (process.env.NODE_ENV === 'production') {
  console.error('Reset recusado em produção.')
  process.exit(1)
}

const banco = conexoesDosScripts()

executarScript(async () => {
  const schemas = await banco.plataforma.$queryRaw<{ nome: string }[]>`
    SELECT schema_name AS nome FROM information_schema.schemata WHERE schema_name = 'plataforma' OR schema_name LIKE 'emp\_%'`
  for (const { nome } of schemas) await banco.plataforma.$executeRawUnsafe(`DROP SCHEMA "${nome}" CASCADE`)
  await banco.plataforma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE')
  await banco.plataforma.$executeRawUnsafe('CREATE SCHEMA public')
  console.log(`Banco zerado (${schemas.length + 1} schema(s) removido(s)).`)
}, banco.fechar)
