/**
 * Aplica as migrations no schema da plataforma, no schema legado (public) e no de cada empresa.
 * Roda a cada subida da API, antes do seed. Schemas já em dia são pulados sem chamar o Prisma.
 */
import { SCHEMA_LEGADO, SCHEMA_PLATAFORMA } from '../src/core/banco'
import { migrarSchema } from '../src/plataforma/migracoes'
import { conexoesDosScripts, executarScript } from './scripts-banco'

const banco = conexoesDosScripts()

executarScript(async () => {
  const inicio = Date.now()
  await migrarSchema(banco.plataforma, banco.url, SCHEMA_PLATAFORMA)
  const empresas = await banco.plataforma.assinante.findMany({ select: { schema: true } })
  const schemas = [...new Set([SCHEMA_LEGADO, ...empresas.map((e) => e.schema)])]
  let atualizados = 0
  for (const schema of schemas) {
    if (await migrarSchema(banco.plataforma, banco.url, schema)) {
      atualizados++
      console.log(`Migrations aplicadas no schema ${schema}.`)
    }
  }
  console.log(`Banco em dia: plataforma + ${schemas.length} schema(s) de empresa (${atualizados} atualizado(s), ${Date.now() - inicio} ms).`)
}, banco.fechar)
