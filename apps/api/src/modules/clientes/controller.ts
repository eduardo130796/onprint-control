import type { FastifyRequest } from 'fastify'
import type { clienteSchema, clientesQuerySchema, contatoSchema, enderecoSchema } from '@onprint/shared'
import type { z } from 'zod'
import type { ClientesService } from './service'

type Req = FastifyRequest

/** Lê a requisição e delega ao service; nenhuma regra de negócio aqui. */
export function criarClientesController(service: ClientesService) {
  const usuario = (request: Req) => request.user.sub

  return {
    listar: (query: z.output<typeof clientesQuerySchema>) => service.listar(query),
    obter: (id: string) => service.obter(id),
    criar: (request: Req, dados: z.output<typeof clienteSchema>) => service.criar(dados, usuario(request)),
    atualizar: (request: Req, id: string, dados: z.output<typeof clienteSchema>) =>
      service.atualizar(id, dados, usuario(request)),
    desativar: (request: Req, id: string) => service.alterarAtivo(id, false, usuario(request)),
    reativar: (request: Req, id: string) => service.alterarAtivo(id, true, usuario(request)),

    criarEndereco: (request: Req, clienteId: string, dados: z.output<typeof enderecoSchema>) =>
      service.criarEndereco(clienteId, dados, usuario(request)),
    atualizarEndereco: (request: Req, clienteId: string, id: string, dados: z.output<typeof enderecoSchema>) =>
      service.atualizarEndereco(clienteId, id, dados, usuario(request)),
    removerEndereco: (request: Req, clienteId: string, id: string) =>
      service.removerEndereco(clienteId, id, usuario(request)),

    criarContato: (request: Req, clienteId: string, dados: z.output<typeof contatoSchema>) =>
      service.criarContato(clienteId, dados, usuario(request)),
    atualizarContato: (request: Req, clienteId: string, id: string, dados: z.output<typeof contatoSchema>) =>
      service.atualizarContato(clienteId, id, dados, usuario(request)),
    removerContato: (request: Req, clienteId: string, id: string) =>
      service.removerContato(clienteId, id, usuario(request)),
  }
}
