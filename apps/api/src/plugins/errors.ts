import fp from 'fastify-plugin'
import type { FastifyError } from 'fastify'
import { Prisma } from '@prisma/client'
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod'
import { CODIGOS_ERRO, type ErroApi } from '@onprint/shared'
import { AppError } from '../core/AppError'

function corpo(code: string, message: string, details?: unknown): ErroApi {
  return { error: details === undefined ? { code, message } : { code, message, details } }
}

/** Padroniza todas as respostas de erro no formato { error: { code, message, details? } }. */
export const errorsPlugin = fp(async (app) => {
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(corpo(CODIGOS_ERRO.NAO_ENCONTRADO, `Rota ${request.method} ${request.url} não encontrada.`))
  })

  app.setErrorHandler((erro: FastifyError, request, reply) => {
    if (erro instanceof AppError) {
      return reply.status(erro.statusCode).send(corpo(erro.code, erro.message, erro.details))
    }

    if (hasZodFastifySchemaValidationErrors(erro)) {
      const details = erro.validation.map((v) => ({
        campo:
          v.instancePath.replace(/^\//, '').replace(/\//g, '.') ||
          ((v.params as { issue?: { path?: PropertyKey[] } }).issue?.path ?? []).map(String).join('.'),
        mensagem: v.message,
      }))
      return reply.status(400).send(corpo(CODIGOS_ERRO.VALIDACAO, 'Dados inválidos.', details))
    }

    if (erro instanceof Prisma.PrismaClientKnownRequestError) {
      if (erro.code === 'P2002') {
        return reply.status(409).send(corpo(CODIGOS_ERRO.CONFLITO, 'Já existe um registro com estes dados.', erro.meta))
      }
      if (erro.code === 'P2025') {
        return reply.status(404).send(corpo(CODIGOS_ERRO.NAO_ENCONTRADO, 'Registro não encontrado.'))
      }
      if (erro.code === 'P2003') {
        return reply
          .status(409)
          .send(corpo(CODIGOS_ERRO.CONFLITO, 'O registro está vinculado a outros dados e não pode ser alterado.'))
      }
    }

    if (erro.statusCode === 429) {
      return reply
        .status(429)
        .send(corpo(CODIGOS_ERRO.MUITAS_TENTATIVAS, 'Muitas tentativas. Aguarde um minuto e tente novamente.'))
    }

    if (isResponseSerializationError(erro)) {
      request.log.error({ err: erro }, 'Resposta fora do schema declarado')
    } else if (erro.statusCode && erro.statusCode < 500) {
      return reply.status(erro.statusCode).send(corpo(CODIGOS_ERRO.VALIDACAO, erro.message))
    } else {
      request.log.error({ err: erro }, 'Erro não tratado')
    }
    return reply.status(500).send(corpo(CODIGOS_ERRO.ERRO_INTERNO, 'Erro interno. Tente novamente.'))
  })
})
