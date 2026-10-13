import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { montarHtmlOg } from '../vitrine/og'
import { linkDoCaminho, previaDoPedido } from './acompanhamento'
import { criarAcompanhamentoService } from './acompanhamento.service'

/**
 * GET /publico/pedido-og?caminho=/pedido/{empresa}/{token} — prévia do link "Acompanhe seu pedido" (Open Graph)
 * para o WhatsApp: o leitor de link não roda o JavaScript da página, então o Caddy (produção) e o Vite
 * (desenvolvimento) desviam só os leitores de link (User-Agent) para cá. Mesma regra de bloqueio das rotas públicas.
 */
export const previaPedidoRoutes: FastifyPluginAsyncZod = async (app) => {
  const acompanhamento = criarAcompanhamentoService(app)

  app.get(
    '/pedido-og',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { tags: ['publico'], summary: 'HTML com as tags Open Graph do link de acompanhamento do pedido', querystring: z.object({ caminho: z.string().max(300) }) },
    },
    async (req, reply) => {
      reply.header('Content-Type', 'text/html; charset=utf-8').header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex')
      const naoEncontrado = () =>
        reply.status(404).send(montarHtmlOg({ titulo: 'Pedido não encontrado', tituloAba: 'Pedido não encontrado', descricao: null, url: app.config.APP_URL, siteNome: 'GrafyGo', imagem: null }))
      const link = linkDoCaminho(req.query.caminho)
      const empresa = link ? await app.empresas.porSlug(link.slug) : null
      if (!link || !empresa || empresa.assinatura?.acesso.nivel === 'bloqueado') return naoEncontrado()
      const dados = await contextoEmpresa.com(empresa, () => acompanhamento.obter(link.token)).catch(() => null)
      if (!dados) return naoEncontrado()
      return reply.send(montarHtmlOg(previaDoPedido(dados, `${app.config.APP_URL}${req.query.caminho.split(/[?#]/)[0]}`)))
    },
  )
}
