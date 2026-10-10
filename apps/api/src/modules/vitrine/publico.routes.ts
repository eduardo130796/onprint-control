import type { FastifyInstance } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { pedidoVitrineSchema, produtosPublicosQuerySchema, slugVitrine } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { contextoEmpresa, type EmpresaAtual } from '../../core/contexto-empresa'
import { FORMATOS_IMAGEM, LARGURAS_IMAGEM, enviarImagem } from './imagens'
import { htmlOgGenerico, montarHtmlOg, origemDoHost, paginaDoCaminho } from './og'
import { criarVitrinePublicaService } from './publico.service'
import { dominioVitrine, slugDoDominio } from './regras'
import { lerConfigVitrine } from './vitrine.service'

const tags = ['vitrine-publica']
const NAO_ENCONTRADA = 'Site não encontrado.'
/** Leitura do site: generoso (cada página puxa várias imagens) */
const limiteLeitura = { rateLimit: { max: 300, timeWindow: '1 minute' } }
/** Envio da lista de orçamento: 5 por IP a cada 10 minutos */
const limiteEnvio = { rateLimit: { max: 5, timeWindow: '10 minutes', keyGenerator: (req: { ip: string }) => `vitrine-pedido:${req.ip}` } }

/** Empresa com a vitrine no ar: ativa, não bloqueada, com o módulo no plano e a vitrine ligada. */
async function vitrineNoAr(empresa: EmpresaAtual | null, consultarConfig: () => Promise<{ ativa: boolean }>) {
  if (!empresa || empresa.assinatura?.acesso.nivel === 'bloqueado') return false
  if (empresa.assinatura && !empresa.assinatura.modulos.includes('vitrine')) return false
  return (await consultarConfig()).ativa
}

/** Site público da gráfica: registrado em /publico/:empresa/vitrine (sem login). */
export const vitrinePublicaRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = criarVitrinePublicaService(app)

  app.addHook('onRequest', async (req) => {
    const empresa = await app.empresas.porSlug(String((req.params as { empresa?: string }).empresa ?? ''))
    if (empresa) contextoEmpresa.definir(empresa)
    if (!(await vitrineNoAr(empresa, () => lerConfigVitrine(app.prisma)))) throw AppError.naoEncontrado(NAO_ENCONTRADA)
  })

  app.get('/', { config: limiteLeitura, schema: { tags, summary: 'Início do site: empresa, banners, categorias e destaques' } }, () => service.inicio())
  app.get('/produtos', { config: limiteLeitura, schema: { tags, summary: 'Produtos publicados (busca, categoria, paginação)', querystring: produtosPublicosQuerySchema } }, (req) =>
    service.listar(req.query),
  )
  app.get('/produtos/:slug', { config: limiteLeitura, schema: { tags, summary: 'Produto publicado com galeria e acabamentos', params: z.object({ slug: slugVitrine }) } }, (req) =>
    service.obter(req.params.slug),
  )
  app.post('/pedidos', { config: limiteEnvio, schema: { tags, summary: 'Envia a lista de orçamento (vira Solicitação)', body: pedidoVitrineSchema } }, (req) =>
    service.enviarPedido(req.body, req.ip),
  )
  app.get(
    '/imagens/:arquivoId',
    {
      config: limiteLeitura,
      schema: {
        tags,
        summary: 'Imagem redimensionada, WebP ou JPEG com f=jpg (banner, logo ou produto publicado)',
        params: z.object({ arquivoId: z.string().uuid() }),
        querystring: z.object({ w: z.enum(LARGURAS_IMAGEM).default('480'), f: z.enum(FORMATOS_IMAGEM).default('webp') }),
      },
    },
    async (req, reply) => {
      const arquivo = await service.arquivoPublico(req.params.arquivoId)
      if (!arquivo) throw AppError.naoEncontrado('Imagem não encontrada.')
      return enviarImagem(app.storage, reply, arquivo, req.query.w, 'public', req.query.f)
    },
  )
}

/** Empresa do subdomínio com a vitrine no ar (mesmas regras do site), ou null */
async function empresaDoDominio(app: FastifyInstance, dominio: string) {
  const slug = slugDoDominio(dominio, dominioVitrine(app.config))
  const empresa = slug ? await app.empresas.porSlug(slug) : null
  const noAr = await vitrineNoAr(empresa, () => contextoEmpresa.com(empresa as EmpresaAtual, () => lerConfigVitrine(app.prisma)))
  return noAr ? empresa : null
}

/** GET /publico/vitrine-permitida?domain=x — o Caddy pergunta antes de emitir o certificado HTTPS do subdomínio. */
export const vitrinePermitidaRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = criarVitrinePublicaService(app)

  app.get(
    '/vitrine-permitida',
    { config: limiteLeitura, schema: { tags, summary: 'Subdomínio é uma vitrine no ar? (200/404, para o HTTPS sob demanda)', querystring: z.object({ domain: z.string().max(253) }) } },
    async (req, reply) => {
      if (!(await empresaDoDominio(app, req.query.domain))) throw AppError.naoEncontrado(NAO_ENCONTRADA)
      return reply.send({ ok: true })
    },
  )

  /**
   * GET /publico/vitrine-og?host=x&caminho=/produto/y — prévia do link (Open Graph) para WhatsApp, Facebook,
   * Telegram… O Caddy (produção) e o Vite (desenvolvimento) desviam para cá só os leitores de link (User-Agent).
   */
  app.get(
    '/vitrine-og',
    {
      config: limiteLeitura,
      schema: {
        tags,
        summary: 'HTML com as tags Open Graph de uma página da vitrine (prévia do link)',
        querystring: z.object({ host: z.string().max(260), caminho: z.string().max(2048).default('/') }),
      },
    },
    async (req, reply) => {
      reply.header('Content-Type', 'text/html; charset=utf-8').header('Cache-Control', 'public, max-age=300')
      const origem = origemDoHost(req.query.host, req.headers['x-forwarded-proto'] as string | undefined)
      const empresa = origem ? await empresaDoDominio(app, req.query.host) : null
      if (!origem || !empresa) return reply.status(404).send(htmlOgGenerico())
      const dados = await contextoEmpresa.com(empresa, () => service.previaLink(paginaDoCaminho(req.query.caminho), origem))
      return reply.send(montarHtmlOg(dados))
    },
  )
}
