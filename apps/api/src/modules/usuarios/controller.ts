import type { FastifyRequest } from 'fastify'
import type { criarUsuarioSchema, editarUsuarioSchema, redefinirSenhaSchema, usuariosQuerySchema } from '@onprint/shared'
import type { z } from 'zod'
import type { UsuariosService } from './service'

export function criarUsuariosController(service: UsuariosService) {
  return {
    listar: (query: z.output<typeof usuariosQuerySchema>) => service.listar(query),
    opcoes: () => service.opcoes(),
    papeis: () => service.papeis(),
    obter: (id: string) => service.obter(id),
    criar: (request: FastifyRequest, dados: z.output<typeof criarUsuarioSchema>) => service.criar(dados, request.user.sub),
    atualizar: (request: FastifyRequest, id: string, dados: z.output<typeof editarUsuarioSchema>) =>
      service.atualizar(id, dados, request.user.sub),
    redefinirSenha: (request: FastifyRequest, id: string, dados: z.output<typeof redefinirSenhaSchema>) =>
      service.redefinirSenha(id, dados.senhaProvisoria, request.user.sub),
    enviarLinkSenha: (id: string) => service.enviarLinkSenha(id),
    desativar: (request: FastifyRequest, id: string) => service.desativar(id, request.user.sub),
  }
}
