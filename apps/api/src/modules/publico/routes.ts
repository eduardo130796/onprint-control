import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { aprovacaoPublicaSchema, arteAjustePublicoSchema, arteAprovacaoPublicaSchema, recusaSchema, tokenPublicoParamSchema } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { criarAcompanhamentoService } from './acompanhamento.service'
import { criarArtesPublicoService } from './artes.service'
import { criarPublicoService } from './service'
import { criarConversaoAutomatica } from '../orcamentos/conversao-automatica'
import { criarConversaoService } from '../orcamentos/conversao.service'
import { criarOrcamentosService } from '../orcamentos/orcamentos.service'

const tags = ['publico']
/** Rotas sem login: limite de requisições por IP para dificultar tentativa de tokens. */
const limite = { rateLimit: { max: 30, timeWindow: '1 minute' } }

export const publicoRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = criarPublicoService(app, criarConversaoAutomatica(app, criarConversaoService(app, criarOrcamentosService(app))))
  const artes = criarArtesPublicoService(app)
  const acompanhamento = criarAcompanhamentoService(app)

  // Registradas sob /publico/:empresa: o slug da empresa no link escolhe o schema
  app.addHook('onRequest', async (req) => {
    const empresa = await app.empresas.porSlug(String((req.params as { empresa?: string }).empresa ?? ''))
    // Empresa bloqueada (atraso, cancelamento ou suspensão): os links dela param de funcionar
    if (!empresa || empresa.assinatura?.acesso.nivel === 'bloqueado') throw AppError.naoEncontrado('Link inválido ou expirado.')
    contextoEmpresa.definir(empresa)
  })

  // "controller": só repassa token, corpo e IP ao service
  app.get(
    '/orcamentos/:token',
    { config: limite, schema: { tags, summary: 'Orçamento pelo link de aprovação (sem login)', params: tokenPublicoParamSchema } },
    (req) => service.obter(req.params.token),
  )
  app.post(
    '/orcamentos/:token/aprovar',
    { config: limite, schema: { tags, summary: 'Cliente aprova o orçamento', params: tokenPublicoParamSchema, body: aprovacaoPublicaSchema } },
    (req) => service.responder(req.params.token, { aprovar: true, nome: req.body.nome }, req.ip),
  )
  app.post(
    '/orcamentos/:token/recusar',
    { config: limite, schema: { tags, summary: 'Cliente recusa o orçamento', params: tokenPublicoParamSchema, body: recusaSchema } },
    (req) => service.responder(req.params.token, { aprovar: false, motivo: req.body.motivo }, req.ip),
  )

  // Arte: o cliente aprova ou pede ajuste pelo link /arte/:token
  app.get(
    '/artes/:token',
    { config: limite, schema: { tags, summary: 'Arte pelo link de aprovação (sem login)', params: tokenPublicoParamSchema } },
    (req) => artes.obter(req.params.token),
  )
  app.post(
    '/artes/:token/aprovar',
    { config: limite, schema: { tags, summary: 'Cliente aprova a arte', params: tokenPublicoParamSchema, body: arteAprovacaoPublicaSchema } },
    (req) => artes.aprovar(req.params.token, req.body.nome, req.ip),
  )
  app.post(
    '/artes/:token/ajuste',
    { config: limite, schema: { tags, summary: 'Cliente pede ajuste na arte', params: tokenPublicoParamSchema, body: arteAjustePublicoSchema } },
    (req) => artes.pedirAjuste(req.params.token, req.body.nome, req.body.comentario, req.ip),
  )

  // "Acompanhe seu pedido": o cliente vê o andamento pelo link /pedido/:token (só leitura)
  app.get(
    '/pedidos/:token',
    { config: limite, schema: { tags, summary: 'Andamento do pedido pelo link de acompanhamento (sem login)', params: tokenPublicoParamSchema } },
    async (req, reply) => {
      // Dados do pedido do cliente: nada de cache compartilhado nem indexação
      reply.header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex')
      return acompanhamento.obter(req.params.token)
    },
  )
}
