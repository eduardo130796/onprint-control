import { PrismaClient } from '@prisma/client'

/*
 * Identidades da conta conectada (número e LID) lidas das credenciais da instância na Evolution.
 *
 * O voto da enquete no endereçamento novo do WhatsApp é cifrado com o LID da gráfica como criador (ver
 * modules/whatsapp/enquete.ts), e esse LID (creds.me.lid do Baileys = client.user.lid) não sai em nenhuma rota da
 * Evolution v2.3.7: connectionState, fetchInstances (ownerJid), o webhook (sender = wuid) e whatsappNumbers só trazem
 * o número. Ele fica nas credenciais que a Evolution guarda no banco dela ("evolution", no mesmo Postgres do compose,
 * mesmo usuário): tabela "Session" (sessionId = "Instance".id), coluna creds = JSON (às vezes um JSON dentro de uma
 * string) no formato BufferJSON do Baileys, com me = { id: "5511…:6@s.whatsapp.net", lid: "1234…:6@lid", name }.
 * Só leitura, uma linha, sem nada além do "me".
 */

export interface IdentidadeWhatsapp {
  /** "5511…@s.whatsapp.net" sem o aparelho */
  jid: string | null
  /** "1234…@lid" sem o aparelho */
  lid: string | null
}

const semAparelho = (jid: unknown): string | null => {
  if (typeof jid !== 'string' || !jid.includes('@')) return null
  const [usuario, servidor] = jid.trim().split('@')
  const u = usuario!.split(':')[0]!.split('_')[0]!
  return u && servidor ? `${u}@${servidor}` : null
}

/** creds da tabela "Session" → número e LID da conta (null se não der para ler) */
export function identidadeDasCredenciais(creds: unknown): IdentidadeWhatsapp | null {
  let valor: unknown = creds
  for (let i = 0; i < 2 && typeof valor === 'string'; i++) {
    try {
      valor = JSON.parse(valor)
    } catch {
      return null
    }
  }
  const me = (valor as { me?: { id?: unknown; lid?: unknown } } | null)?.me
  if (!me || typeof me !== 'object') return null
  const jid = semAparelho(me.id)
  const lid = semAparelho(me.lid)
  const resultado = { jid: jid && /@s\.whatsapp\.net$/.test(jid) ? jid : null, lid: lid && /@lid$/.test(lid) ? lid : null }
  return resultado.jid || resultado.lid ? resultado : null
}

/** Banco da Evolution: EVOLUTION_DATABASE_URL ou, sem ela, o DATABASE_URL da API com o banco "evolution" (como no compose) */
export function urlDoBancoEvolution(config: { DATABASE_URL: string; EVOLUTION_DATABASE_URL?: string }): string | null {
  if (config.EVOLUTION_DATABASE_URL) return config.EVOLUTION_DATABASE_URL
  try {
    const url = new URL(config.DATABASE_URL)
    url.pathname = '/evolution'
    url.searchParams.set('schema', 'public')
    url.searchParams.set('connection_limit', '1')
    return url.toString()
  } catch {
    return null
  }
}

export interface LeitorCredenciais {
  (instancia: string): Promise<unknown>
  fechar?: () => Promise<void>
}

/** Lê a coluna creds da instância (cliente Prisma próprio, criado na primeira leitura, uma conexão) */
export function leitorCredenciaisEvolution(url: string): LeitorCredenciais {
  let cliente: PrismaClient | null = null
  const ler: LeitorCredenciais = async (instancia) => {
    cliente ??= new PrismaClient({ datasourceUrl: url, log: [] })
    const linhas = await cliente.$queryRaw<{ creds: unknown }[]>`
      SELECT s."creds" FROM "Session" s JOIN "Instance" i ON i."id" = s."sessionId" WHERE i."name" = ${instancia} LIMIT 1`
    return linhas[0]?.creds ?? null
  }
  ler.fechar = async () => {
    await cliente?.$disconnect()
    cliente = null
  }
  return ler
}
