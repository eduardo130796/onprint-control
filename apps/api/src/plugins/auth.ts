import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import type { FastifyRequest } from 'fastify'
import { CODIGOS_ERRO } from '@onprint/shared'
import { AppError } from '../core/AppError'
import { contextoEmpresa } from '../core/contexto-empresa'

/** Conteúdo do access token (JWT curto). */
export interface AccessTokenPayload {
  sub: string
  papelId: string
  /** true enquanto o usuário precisa trocar a senha */
  dts: boolean
  /** Empresa assinante (id em plataforma.assinantes) */
  emp: string
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload
    user: AccessTokenPayload
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Exige access token válido e senha já trocada. */
    autenticar: (request: FastifyRequest) => Promise<void>
    /** Exige access token válido, mesmo com troca de senha pendente (rotas me e trocar-senha). */
    autenticarPermitindoTrocaSenha: (request: FastifyRequest) => Promise<void>
  }
}

export const authPlugin = fp(async (app) => {
  /** Valida o token e entra no schema da empresa dele (desativada = sessão encerrada). */
  async function verificarToken(request: FastifyRequest) {
    try {
      await request.jwtVerify()
    } catch {
      throw AppError.naoAutenticado()
    }
    const empresa = await app.empresas.porId(request.user.emp)
    if (!empresa) throw AppError.naoAutenticado()
    contextoEmpresa.definir(empresa)
  }

  await app.register(jwt, {
    secret: app.config.JWT_ACCESS_SECRET,
    sign: { expiresIn: app.config.JWT_ACCESS_EXPIRES.texto },
  })

  app.decorate('autenticarPermitindoTrocaSenha', async (request: FastifyRequest) => {
    await verificarToken(request)
  })

  app.decorate('autenticar', async (request: FastifyRequest) => {
    await verificarToken(request)
    if (request.user.dts) {
      throw new AppError(403, CODIGOS_ERRO.TROCA_SENHA_OBRIGATORIA, 'Troque sua senha para continuar.')
    }
  })
})
