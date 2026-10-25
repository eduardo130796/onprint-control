import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { AppError } from '../../core/AppError'
import { criarRespostasWhatsapp } from './respostas.service'
import { empresaDaInstancia, lerAvisoWebhook, segredoConfere, segredoDaEmpresa, segredoDoServidor } from './webhook'

/**
 * POST /publico/whatsapp/webhook/:segredo — a Evolution avisa mensagens recebidas (texto e voto da enquete do
 * orçamento) e a conexão. Sem login: o segredo do endereço é por empresa e precisa bater com a instância do corpo
 * ("grafygo-{id}"). Responde 200 depois de autenticado (mesmo quando ignora), para a Evolution não repetir o aviso.
 */
export const whatsappWebhookRoutes: FastifyPluginAsyncZod = async (app) => {
  const respostas = criarRespostasWhatsapp(app)
  const segredoServidor = segredoDoServidor(app.config)

  app.post(
    '/whatsapp/webhook/:segredo',
    {
      // Mensagem com miniatura de imagem passa de 1 MB às vezes
      bodyLimit: 5 * 1024 * 1024,
      config: { rateLimit: { max: 1200, timeWindow: '1 minute' } },
      schema: { tags: ['publico'], summary: 'Webhook da Evolution API (respostas do cliente no WhatsApp e conexão)', params: z.object({ segredo: z.string().min(1).max(100) }) },
    },
    async (req) => {
      const aviso = lerAvisoWebhook(req.body)
      const empresaId = empresaDaInstancia(aviso.instancia)
      if (!empresaId || !segredoConfere(req.params.segredo, segredoDaEmpresa(segredoServidor, empresaId))) throw AppError.naoAutenticado('Webhook inválido.')
      const empresa = await app.empresas.porId(empresaId)
      if (!empresa || empresa.assinatura?.acesso.nivel === 'bloqueado') return { recebido: true, eventos: [] }
      if (!aviso.eventos.length) return { recebido: true, eventos: [] }
      return { recebido: true, eventos: await respostas.processar(empresa, aviso) }
    },
  )
}
