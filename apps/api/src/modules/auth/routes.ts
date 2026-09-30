import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { erroApiSchema, loginSchema, respostaLoginSchema, trocarSenhaSchema, usuarioLogadoSchema } from '@onprint/shared'
import { criarAuthController } from './controller'
import { criarAuthService } from './service'

const erros = { 400: erroApiSchema, 401: erroApiSchema, 403: erroApiSchema, 422: erroApiSchema, 429: erroApiSchema }

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = criarAuthController(criarAuthService(app), {
    producao: app.config.NODE_ENV === 'production',
    refreshMs: app.config.JWT_REFRESH_EXPIRES.ms,
  })

  app.post(
    '/login',
    {
      // 5 tentativas/min por IP + e-mail: protege cada conta sem travar a loja inteira atrás do mesmo IP
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          hook: 'preHandler',
          keyGenerator: (req) => `${req.ip}:${String((req.body as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase()}`,
        },
      },
      schema: {
        tags: ['auth'],
        summary: 'Login com e-mail e senha',
        body: loginSchema,
        response: { 200: respostaLoginSchema, ...erros },
      },
    },
    (request, reply) => controller.login(request.body, request, reply),
  )

  app.post(
    '/refresh',
    {
      schema: {
        tags: ['auth'],
        summary: 'Renova o access token usando o cookie de refresh',
        response: { 200: respostaLoginSchema, ...erros },
      },
    },
    controller.refresh,
  )

  app.post(
    '/logout',
    { schema: { tags: ['auth'], summary: 'Encerra a sessão atual', response: { 204: z.null() } } },
    controller.logout,
  )

  app.get(
    '/me',
    {
      onRequest: [app.autenticarPermitindoTrocaSenha],
      schema: {
        tags: ['auth'],
        summary: 'Usuário logado, papel e permissões',
        security: [{ bearerAuth: [] }],
        response: { 200: usuarioLogadoSchema, ...erros },
      },
    },
    controller.me,
  )

  app.post(
    '/trocar-senha',
    {
      onRequest: [app.autenticarPermitindoTrocaSenha],
      schema: {
        tags: ['auth'],
        summary: 'Troca a própria senha',
        security: [{ bearerAuth: [] }],
        body: trocarSenhaSchema,
        response: { 200: respostaLoginSchema, ...erros },
      },
    },
    (request, reply) => controller.trocarSenha(request.body, request, reply),
  )
}
