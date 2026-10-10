import { AsyncResource } from 'node:async_hooks'
import fp from 'fastify-plugin'
import { PrismaClient, type Assinante, type Assinatura, type Plano } from '@prisma/client'
import { SCHEMA_PLATAFORMA, urlDoSchema } from '../core/banco'
import { contextoEmpresa, type EmpresaAtual } from '../core/contexto-empresa'
import { resumirAssinatura } from '../plataforma/assinaturas'
import { variantesDominio } from '../modules/vitrine/regras'

export interface RegistroEmpresas {
  /** Empresa ativa pelo id (com cache curto); null se não existe ou foi desativada. */
  porId(id: string | undefined): Promise<EmpresaAtual | null>
  /** Empresa ativa pelo slug dos links públicos. */
  porSlug(slug: string): Promise<EmpresaAtual | null>
  /** Domínio próprio da vitrine (com ou sem "www."), verificado ou não */
  porDominio(host: string): Promise<EmpresaAtual | null>
  /** Todas as empresas ativas (tarefas agendadas). */
  listar(): Promise<EmpresaAtual[]>
  /** Cliente Prisma do schema da empresa (pool próprio, reaproveitado). */
  clienteDe(schema: string): PrismaClient
  /** Descarta o cache (após criar, editar ou desativar uma empresa). */
  esquecer(): void
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Banco da empresa do contexto atual: aponta sozinho para o schema dela. */
    prisma: PrismaClient
    /** Banco da plataforma (schema "plataforma"): assinantes e índice de login. */
    plataforma: PrismaClient
    empresas: RegistroEmpresas
  }
}

/** Tabelas que só existem de verdade no schema da plataforma. */
const MODELOS_PLATAFORMA = new Set(['assinante', 'indiceLogin', 'tokenSenha', 'plano', 'assinatura', 'eventoAssinatura', 'cobranca', 'eventoGateway', 'adminPlataforma', 'cupom', 'cupomUso'])
/** Propriedades sondadas por bibliotecas (await, Fastify, inspeção) que não devem exigir empresa. */
const SONDAGENS = new Set(['then', 'getter', 'setter', 'toJSON', 'constructor', 'asymmetricMatch', '$$typeof', 'inspect'])
const RECURSO = Symbol('onprint.contextoEmpresa')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type AssinanteCompleto = Assinante & { assinatura: (Assinatura & { plano: Plano }) | null }
const comAssinatura = { assinatura: { include: { plano: true } } } as const

const paraContexto = (a: AssinanteCompleto): EmpresaAtual => ({
  id: a.id,
  nome: a.nome,
  slug: a.slug,
  schema: a.schema,
  assinatura: a.assinatura ? resumirAssinatura(a.assinatura) : undefined,
  dominioVitrine: a.dominioVitrineVerificadoEm ? a.dominioVitrine : null,
})

/**
 * Multiempresa (schema por empresa). `app.prisma` é um proxy: cada acesso usa o cliente
 * do schema da empresa do contexto (definida pela autenticação), então os services não mudam.
 */
export const prismaPlugin = fp(async (app) => {
  const { DATABASE_URL, DB_CONEXOES_POR_EMPRESA, DB_MAX_EMPRESAS_ABERTAS, NODE_ENV, CACHE_EMPRESAS_SEGUNDOS } = app.config
  // Empresa + assinatura ficam em cache por pouco tempo: pagamento ou bloqueio valem em segundos
  const CACHE_MS = CACHE_EMPRESAS_SEGUNDOS * 1000
  const log: ('warn' | 'error')[] = NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
  const plataforma = new PrismaClient({ log, datasourceUrl: urlDoSchema(DATABASE_URL, SCHEMA_PLATAFORMA, 5) })

  // Pools por schema em ordem de uso (Map mantém a ordem de inserção): o mais antigo sai primeiro
  const clientes = new Map<string, PrismaClient>()
  function clienteDe(schema: string): PrismaClient {
    let cliente = clientes.get(schema)
    if (cliente) {
      clientes.delete(schema)
    } else {
      cliente = new PrismaClient({ log, datasourceUrl: urlDoSchema(DATABASE_URL, schema, DB_CONEXOES_POR_EMPRESA) })
    }
    clientes.set(schema, cliente)
    if (clientes.size > DB_MAX_EMPRESAS_ABERTAS) {
      const [antigoSchema, antigo] = clientes.entries().next().value as [string, PrismaClient]
      clientes.delete(antigoSchema)
      // Espera as consultas em andamento terminarem antes de fechar o pool
      setTimeout(() => void antigo.$disconnect().catch(() => undefined), 60_000).unref()
    }
    return cliente
  }

  // Só empresas encontradas entram no cache (ids/slugs inventados não ocupam memória), com teto e limpeza periódica
  const cache = new Map<string, { empresa: EmpresaAtual; expira: number }>()
  const MAX_CACHE = 2000
  async function buscar(chave: string, where: { id: string } | { slug: string } | { dominioVitrine: string }) {
    const guardado = cache.get(chave)
    if (guardado && guardado.expira > Date.now()) return guardado.empresa
    const a = await plataforma.assinante.findUnique({ where, include: comAssinatura })
    const empresa = a?.ativo ? paraContexto(a) : null
    cache.delete(chave)
    if (empresa && CACHE_MS > 0) {
      cache.set(chave, { empresa, expira: Date.now() + CACHE_MS })
      if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string)
    }
    return empresa
  }
  const limpeza = setInterval(() => {
    const agora = Date.now()
    for (const [chave, item] of cache) if (item.expira <= agora) cache.delete(chave)
  }, 60_000)
  limpeza.unref()

  const empresas: RegistroEmpresas = {
    // id fora do formato UUID nem vai ao banco (o Postgres recusaria com erro 500)
    porId: (id) => (id && UUID.test(id) ? buscar(`id:${id}`, { id }) : Promise.resolve(null)),
    porSlug: (slug) => buscar(`slug:${slug}`, { slug }),
    // www.x.com.br e x.com.br são a mesma vitrine (a gráfica cadastra um, o visitante pode digitar o outro)
    porDominio: async (host) => {
      for (const dominio of variantesDominio(host)) {
        const empresa = await buscar(`dominio:${dominio}`, { dominioVitrine: dominio })
        if (empresa) return empresa
      }
      return null
    },
    listar: async () => (await plataforma.assinante.findMany({ where: { ativo: true }, include: comAssinatura, orderBy: { createdAt: 'asc' } })).map(paraContexto),
    clienteDe,
    esquecer: () => cache.clear(),
  }

  const prisma = new Proxy({} as PrismaClient, {
    get(_alvo, prop) {
      if (typeof prop === 'symbol' || SONDAGENS.has(prop)) return undefined
      if (MODELOS_PLATAFORMA.has(prop)) throw new Error(`"${prop}" fica no banco da plataforma: use app.plataforma.`)
      const cliente = clienteDe(contextoEmpresa.exigir().schema)
      const valor: unknown = Reflect.get(cliente, prop)
      return typeof valor === 'function' ? valor.bind(cliente) : valor
    },
  })

  app.decorate('plataforma', plataforma)
  app.decorate('empresas', empresas)
  app.decorate('prisma', prisma)

  // Cada requisição ganha um contexto próprio, preenchido pela autenticação. O AsyncResource
  // religa o contexto no preValidation, porque a leitura do corpo da requisição o perde.
  app.addHook('onRequest', (request, _reply, done) => {
    contextoEmpresa.iniciar(() => {
      const recurso = new AsyncResource('onprint:empresa')
      ;(request as unknown as Record<symbol, AsyncResource>)[RECURSO] = recurso
      recurso.runInAsyncScope(done, request.raw)
    })
  })
  app.addHook('preValidation', (request, _reply, done) => {
    const recurso = (request as unknown as Record<symbol, AsyncResource | undefined>)[RECURSO]
    if (recurso) recurso.runInAsyncScope(done, request.raw)
    else done()
  })

  app.addHook('onClose', async () => {
    clearInterval(limpeza)
    await Promise.all([plataforma, ...clientes.values()].map((c) => c.$disconnect()))
  })
})
