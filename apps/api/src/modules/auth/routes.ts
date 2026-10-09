import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  erroApiSchema,
  esqueciSenhaSchema,
  linkSenhaInfoSchema,
  linkSenhaParamSchema,
  loginSchema,
  novaSenhaPorLinkSchema,
  respostaLoginSchema,
  preferenciasSchema, trocarSenhaSchema,
  usuarioLogadoSchema,
} from '@onprint/shared'
import { criarAuthController } from './controller'
import { criarRecuperacaoService } from './recuperacao.service'
import { criarAuthService } from './service'

const erros = { 400: erroApiSchema, 401: erroApiSchema, 403: erroApiSchema, 404: erroApiSchema, 422: erroApiSchema, 429: erroApiSchema }
const porIpEEmail = (req: { ip: string; body?: unknown }) => `${req.ip}:${String((req.body as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase()}`

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = criarAuthController(criarAuthService(app), {
    producao: app.config.NODE_ENV === 'production',
    refreshMs: app.config.JWT_REFRESH_EXPIRES.ms,
  })

  app.post(
    '/login',
    {
      // 20 tentativas/min por IP; além disso, o service trava o e-mail após 10 senhas erradas em 15 min (de qualquer IP)
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['auth'],
        summary: 'Login com e-mail e senha',
        body: loginSchema,
        response: { 200: respostaLoginSchema, ...erros },
      },
    },
    (request, reply) => controller.login(request.body, request, reply),
  )

  const limiteSessao = { rateLimit: { max: 30, timeWindow: '1 minute' } }
  app.post(
    '/refresh',
    {
      config: limiteSessao,
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
    { config: limiteSessao, schema: { tags: ['auth'], summary: 'Encerra a sessão atual', response: { 204: z.null() } } },
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

  // Preferência visual do próprio usuário: vale mesmo no modo só leitura ou bloqueado
  app.put(
    '/preferencias',
    {
      onRequest: [app.autenticarPermitindoTrocaSenha],
      config: { assinaturaLivre: true },
      schema: { tags: ['auth'], summary: 'Preferências do usuário (modo claro/escuro)', security: [{ bearerAuth: [] }], body: preferenciasSchema },
    },
    async (request) => {
      await app.prisma.usuario.update({ where: { id: request.user.sub }, data: { modoTela: request.body.modoTela } })
      return { modoTela: request.body.modoTela }
    },
  )

  app.post(
    '/trocar-senha',
    {
      onRequest: [app.autenticarPermitindoTrocaSenha],
      // 5 tentativas/min por usuário: a senha atual não vira alvo de adivinhação com um token roubado
      config: { rateLimit: { max: 5, timeWindow: '1 minute', hook: 'preHandler', keyGenerator: (req) => `trocar-senha:${(req as { user?: { sub?: string } }).user?.sub ?? req.ip}` } },
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

  // ─── Senha pelo e-mail (sem login) ───
  const recuperacao = criarRecuperacaoService(app)

  app.post(
    '/esqueci-senha',
    {
      // 3 pedidos a cada 15 min por IP + e-mail: não vira ferramenta para encher a caixa de alguém
      config: { rateLimit: { max: 3, timeWindow: '15 minutes', hook: 'preHandler', keyGenerator: porIpEEmail } },
      schema: { tags: ['auth'], summary: 'Envia o link de nova senha (resposta igual exista ou não a conta)', body: esqueciSenhaSchema, response: { 202: z.object({ mensagem: z.string() }), ...erros } },
    },
    async (request, reply) => {
      recuperacao.solicitar(request.body.email, request.ip)
      return reply.status(202).send({ mensagem: 'Se este e-mail tiver acesso ao sistema, enviamos um link para criar uma nova senha.' })
    },
  )

  const limiteLink = { rateLimit: { max: 20, timeWindow: '1 minute' } }
  app.get(
    '/redefinir-senha/:token',
    { config: limiteLink, schema: { tags: ['auth'], summary: 'Confere o link de nova senha', params: linkSenhaParamSchema, response: { 200: linkSenhaInfoSchema, ...erros } } },
    (request) => recuperacao.consultar(request.params.token),
  )
  app.post(
    '/redefinir-senha',
    { config: limiteLink, schema: { tags: ['auth'], summary: 'Cria a senha nova pelo link do e-mail', body: novaSenhaPorLinkSchema, response: { 204: z.null(), ...erros } } },
    async (request, reply) => {
      await recuperacao.redefinir(request.body.token, request.body.novaSenha)
      return reply.status(204).send(null)
    },
  )
}
