import type { FastifyReply, FastifyRequest } from 'fastify'
import type { LoginInput, TrocarSenhaInput } from '@onprint/shared'
import type { AuthService, ResultadoAutenticacao } from './service'

export const COOKIE_REFRESH = 'onprint_rt'
const COOKIE_PATH = '/api/v1/auth'

export function criarAuthController(service: AuthService, opcoes: { producao: boolean; refreshMs: number }) {
  function meta(request: FastifyRequest) {
    return { ip: request.ip, userAgent: request.headers['user-agent'] }
  }

  function responder(reply: FastifyReply, resultado: ResultadoAutenticacao) {
    if (resultado.refreshToken) {
      reply.setCookie(COOKIE_REFRESH, resultado.refreshToken, {
        httpOnly: true,
        secure: opcoes.producao,
        sameSite: 'strict',
        path: COOKIE_PATH,
        maxAge: Math.floor(opcoes.refreshMs / 1000),
      })
    }
    return { accessToken: resultado.accessToken, usuario: resultado.usuario }
  }

  return {
    async login(body: LoginInput, request: FastifyRequest, reply: FastifyReply) {
      return responder(reply, await service.login(body, meta(request)))
    },

    async refresh(request: FastifyRequest, reply: FastifyReply) {
      return responder(reply, await service.renovar(request.cookies[COOKIE_REFRESH], meta(request)))
    },

    async logout(request: FastifyRequest, reply: FastifyReply) {
      await service.logout(request.cookies[COOKIE_REFRESH])
      reply.clearCookie(COOKIE_REFRESH, { path: COOKIE_PATH })
      return reply.status(204).send()
    },

    async me(request: FastifyRequest) {
      return service.me(request.user.sub)
    },

    async trocarSenha(body: TrocarSenhaInput, request: FastifyRequest, reply: FastifyReply) {
      return responder(reply, await service.trocarSenha(request.user.sub, body, meta(request)))
    },
  }
}
