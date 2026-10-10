import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { pedidoVitrineSchema, produtosPublicosQuerySchema, slugVitrine } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { contextoEmpresa, type EmpresaAtual } from '../../core/contexto-empresa'
import { LARGURAS_IMAGEM, enviarImagem } from './imagens'
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
    { config: limiteLeitura, schema: { tags, summary: 'Imagem WebP redimensionada (banner, logo ou produto publicado)', params: z.object({ arquivoId: z.string().uuid() }), querystring: z.object({ w: z.enum(LARGURAS_IMAGEM).default('480') }) } },
    async (req, reply) => {
      const arquivo = await service.arquivoPublico(req.params.arquivoId)
      if (!arquivo) throw AppError.naoEncontrado('Imagem não encontrada.')
      return enviarImagem(app.storage, reply, arquivo, req.query.w, 'public')
    },
  )
}

/** GET /publico/vitrine-permitida?domain=x — o Caddy pergunta antes de emitir o certificado HTTPS do subdomínio. */
export const vitrinePermitidaRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/vitrine-permitida',
    { config: limiteLeitura, schema: { tags, summary: 'Subdomínio é uma vitrine no ar? (200/404, para o HTTPS sob demanda)', querystring: z.object({ domain: z.string().max(253) }) } },
    async (req, reply) => {
      const slug = slugDoDominio(req.query.domain, dominioVitrine(app.config))
      const empresa = slug ? await app.empresas.porSlug(slug) : null
      const noAr = await vitrineNoAr(empresa, () => contextoEmpresa.com(empresa as EmpresaAtual, () => lerConfigVitrine(app.prisma)))
      if (!noAr) throw AppError.naoEncontrado(NAO_ENCONTRADA)
      return reply.send({ ok: true })
    },
  )
}
