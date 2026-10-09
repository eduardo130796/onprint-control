import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest } from 'fastify'
import { empresaSchema, precificacaoSchema, temaEmpresaSchema } from '@onprint/shared'
import type { z } from 'zod'
import { criarArquivosService } from '../arquivos/service'
import { criarCustosService } from '../produtos/custos.service'
import { criarEmpresaService } from './service'

const tags = ['empresa']
const CAMPOS_PRECIFICACAO = new Set(['impostosPercentual', 'comissaoPercentual', 'rateioModo', 'custoFixoPercentual', 'custoFixoMensal', 'horasProdutivasMes', 'lucroDesejadoPadrao', 'lucroMinimoPadrao'])

function criarEmpresaController(service: ReturnType<typeof criarEmpresaService>) {
  return {
    obter: () => service.obter(),
    atualizar: (request: FastifyRequest, dados: z.output<typeof empresaSchema>) => service.atualizar(dados, request.user.sub),
    trocarLogo: (request: FastifyRequest) => service.trocarLogo(request, request.user.sub),
    trocarTema: (request: FastifyRequest, cor: string) => service.trocarTema(cor, request.user.sub),
  }
}

export const empresaRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = criarEmpresaController(criarEmpresaService(app, criarArquivosService(app)))

  // Dados da empresa (nome, logo, padrões) são usados em várias telas: leitura para qualquer usuário logado
  // Dados da empresa servem a várias telas (qualquer usuário logado); os parâmetros de preço (impostos, custo fixo,
  // lucro) só para quem edita produtos ou configurações
  app.get('/', { onRequest: [app.autenticar], schema: { tags, summary: 'Dados da empresa' } }, async (request) => {
    const empresa = await c.obter()
    const permissoes = await app.permissoesDoPapel(request.user.papelId)
    if (permissoes.has('produtos:editar') || permissoes.has('configuracoes:editar')) return empresa
    return Object.fromEntries(Object.entries(empresa).filter(([campo]) => !CAMPOS_PRECIFICACAO.has(campo)))
  })
  app.put(
    '/',
    {
      onRequest: [app.exigirPermissao('configuracoes', 'editar')],
      schema: { tags, summary: 'Atualiza os dados da empresa', body: empresaSchema },
    },
    (req) => c.atualizar(req, req.body),
  )
  app.put(
    '/tema',
    {
      onRequest: [app.exigirPermissao('configuracoes', 'editar')],
      schema: { tags, summary: 'Cor do tema do sistema (paleta)', body: temaEmpresaSchema },
    },
    (req) => c.trocarTema(req, req.body.corTema),
  )
  app.post(
    '/logo',
    {
      onRequest: [app.exigirPermissao('configuracoes', 'editar')],
      schema: { tags, summary: 'Envia o logo (multipart, PNG/JPG/SVG)', consumes: ['multipart/form-data'] },
    },
    (req) => c.trocarLogo(req),
  )

  // Precificação (impostos, comissão, custos fixos, lucro padrão): o custo dos produtos em composição é recalculado
  const custos = criarCustosService(app)
  app.get('/precificacao', { onRequest: [app.exigirPermissao('produtos', 'visualizar')], schema: { tags, summary: 'Parâmetros de preço da empresa' } }, () => custos.obterPrecificacao())
  app.put(
    '/precificacao',
    { onRequest: [app.exigirPermissao('configuracoes', 'editar')], schema: { tags, summary: 'Salva a precificação e recalcula os custos', body: precificacaoSchema } },
    (req) => custos.salvarPrecificacao(req.body, req.user.sub),
  )
}
