import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest } from 'fastify'
import { empresaSchema } from '@onprint/shared'
import type { z } from 'zod'
import { criarArquivosService } from '../arquivos/service'
import { criarEmpresaService } from './service'

const tags = ['empresa']

function criarEmpresaController(service: ReturnType<typeof criarEmpresaService>) {
  return {
    obter: () => service.obter(),
    atualizar: (request: FastifyRequest, dados: z.output<typeof empresaSchema>) => service.atualizar(dados, request.user.sub),
    trocarLogo: (request: FastifyRequest) => service.trocarLogo(request, request.user.sub),
  }
}

export const empresaRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = criarEmpresaController(criarEmpresaService(app, criarArquivosService(app)))

  // Dados da empresa (nome, logo, padrões) são usados em várias telas: leitura para qualquer usuário logado
  app.get('/', { onRequest: [app.autenticar], schema: { tags, summary: 'Dados da empresa' } }, () => c.obter())
  app.put(
    '/',
    {
      onRequest: [app.exigirPermissao('configuracoes', 'editar')],
      schema: { tags, summary: 'Atualiza os dados da empresa', body: empresaSchema },
    },
    (req) => c.atualizar(req, req.body),
  )
  app.post(
    '/logo',
    {
      onRequest: [app.exigirPermissao('configuracoes', 'editar')],
      schema: { tags, summary: 'Envia o logo (multipart, PNG/JPG/SVG)', consumes: ['multipart/form-data'] },
    },
    (req) => c.trocarLogo(req),
  )
}
