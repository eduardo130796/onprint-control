import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { assinarSchema, codigoCupom, trocarFormaSchema, trocarPlanoSchema } from '@onprint/shared'
import { z } from 'zod'
import { AppError } from '../../core/AppError'
import { criarAssinaturaService } from './service'

const tags = ['assinatura']
/** Funciona mesmo com a assinatura bloqueada: é por aqui que a empresa se regulariza. */
const livre = { assinaturaLivre: true } as const

export const assinaturaRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = criarAssinaturaService(app)

  /**
   * Gerenciar a assinatura = quem pode editar as configurações da empresa (o admin, por padrão).
   * Usa as permissões do papel sem o filtro da assinatura: bloqueado, o admin precisa conseguir pagar.
   */
  const podeGerenciar = async (request: FastifyRequest) => (await app.permissoesDoPapel(request.user.papelId)).has('configuracoes:editar')
  const exigirGestor = async (request: FastifyRequest) => {
    await app.autenticar(request)
    if (!(await podeGerenciar(request))) throw AppError.semPermissao('Só o administrador da empresa gerencia a assinatura.')
  }
  const email = async (request: FastifyRequest) => (await app.prisma.usuario.findUnique({ where: { id: request.user.sub }, select: { email: true } }))?.email ?? 'usuário'

  app.get('/assinatura', { onRequest: [app.autenticar], config: livre, schema: { tags, summary: 'Plano, situação, cobranças, módulos e planos' } }, async (request) =>
    service.obter(await podeGerenciar(request)),
  )
  app.post(
    '/assinatura/assinar',
    { onRequest: [exigirGestor], config: livre, schema: { tags, summary: 'Assina pelo pagamento online (Asaas) e devolve o link da 1ª cobrança', body: assinarSchema } },
    async (request) => service.assinar(request.body, await email(request)),
  )
  app.get(
    '/assinatura/cupom',
    {
      onRequest: [exigirGestor],
      config: { ...livre, rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: { tags, summary: 'Confere um cupom e mostra a mensalidade com desconto', querystring: z.object({ codigo: codigoCupom, plano: z.string().min(1).max(40) }) },
    },
    (request) => service.conferirCupom(request.query.codigo ?? '', request.query.plano),
  )
  app.get(
    '/assinatura/plano/previa',
    { onRequest: [exigirGestor], config: livre, schema: { tags, summary: 'O que acontece ao trocar para o plano (proporcional, data, mensalidade)', querystring: z.object({ plano: z.string().min(1).max(40) }) } },
    (request) => service.previaTroca(request.query.plano),
  )
  app.post('/assinatura/plano', { onRequest: [exigirGestor], config: livre, schema: { tags, summary: 'Troca de plano', body: trocarPlanoSchema } }, async (request) => {
    return service.trocarPlano(request.body.plano, await email(request))
  })
  app.post('/assinatura/forma', { onRequest: [exigirGestor], config: livre, schema: { tags, summary: 'Troca a forma de pagamento', body: trocarFormaSchema } }, async (request) => {
    await service.trocarForma(request.body.forma, await email(request))
    return { ok: true }
  })
  app.post('/assinatura/pix-automatico/novo-qr', { onRequest: [exigirGestor], config: livre, schema: { tags, summary: 'Gera outro QR Code do PIX Automático' } }, async (request) => {
    await service.novoQrPix(await email(request))
    return { ok: true }
  })
  app.post('/assinatura/cancelar', { onRequest: [exigirGestor], config: livre, schema: { tags, summary: 'Cancela a recorrência (acesso até o fim do período)' } }, async (request) =>
    service.cancelar(await email(request)),
  )
}
