import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest } from 'fastify'
import { z } from 'zod'
import { CODIGOS_ERRO, cnpjValido } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { ServicoIndisponivel } from '../../integrations/consultas'

const tags = ['consultas']
const cepParam = z.object({ cep: z.string().regex(/^\d{8}$/, 'Informe o CEP com 8 dígitos.') })
const cnpjParam = z.object({ cnpj: z.string().regex(/^\d{14}$/, 'Informe o CNPJ com 14 dígitos.').refine(cnpjValido, 'CNPJ inválido.') })

const indisponivel = () =>
  new AppError(503, CODIGOS_ERRO.SERVICO_INDISPONIVEL, 'Serviço de consulta indisponível agora. Preencha manualmente.')

/** Falha dos serviços externos vira 503 (nunca 500): a tela segue com o preenchimento manual. */
async function semFalhaExterna<T>(request: FastifyRequest, consulta: () => Promise<T>): Promise<T> {
  try {
    return await consulta()
  } catch (erro) {
    if (!(erro instanceof ServicoIndisponivel)) request.log.error({ err: erro }, 'Erro inesperado na consulta externa')
    throw indisponivel()
  }
}

/** Consulta de CEP e CNPJ para preencher cadastros. GET: liberado também no modo só leitura. */
export const consultasRoutes: FastifyPluginAsyncZod = async (app) => {
  const opcoes = {
    onRequest: [app.autenticar],
    // Por usuário (depois do login): protege a cota dos serviços públicos
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
        hook: 'preHandler' as const,
        keyGenerator: (req: FastifyRequest) => `consultas:${(req as { user?: { sub?: string } }).user?.sub ?? req.ip}`,
      },
    },
  }

  app.get('/cep/:cep', { ...opcoes, schema: { tags, summary: 'Endereço pelo CEP', params: cepParam } }, async (request) => {
    const endereco = await semFalhaExterna(request, () => app.consultas.cep(request.params.cep))
    if (!endereco) throw AppError.naoEncontrado('CEP não encontrado.')
    return endereco
  })

  app.get('/cnpj/:cnpj', { ...opcoes, schema: { tags, summary: 'Dados públicos do CNPJ (Receita Federal)', params: cnpjParam } }, async (request) => {
    const dados = await semFalhaExterna(request, () => app.consultas.cnpj(request.params.cnpj))
    if (!dados) throw AppError.naoEncontrado('CNPJ não encontrado na Receita Federal.')
    return dados
  })
}
