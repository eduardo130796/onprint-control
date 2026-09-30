import type { FastifyRequest } from 'fastify'
import type { fornecedorSchema, fornecedoresQuerySchema } from '@onprint/shared'
import type { z } from 'zod'
import type { FornecedoresService } from './service'

type Dados = z.output<typeof fornecedorSchema>

export function criarFornecedoresController(service: FornecedoresService) {
  return {
    listar: (query: z.output<typeof fornecedoresQuerySchema>) => service.listar(query),
    obter: (id: string) => service.obter(id),
    criar: (request: FastifyRequest, dados: Dados) => service.criar(dados, request.user.sub),
    atualizar: (request: FastifyRequest, id: string, dados: Dados) => service.atualizar(id, dados, request.user.sub),
    desativar: (request: FastifyRequest, id: string) => service.alterarAtivo(id, false, request.user.sub),
    reativar: (request: FastifyRequest, id: string) => service.alterarAtivo(id, true, request.user.sub),
  }
}
