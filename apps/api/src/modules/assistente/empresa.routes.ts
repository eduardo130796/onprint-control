import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest } from 'fastify'
import type { Acao, Modulo } from '@onprint/shared'
import { controlesAssistenteSchema, descricaoAssistenteSchema, orcamentoDeTextoSchema, produtoDeTextoSchema, regrasDeTextoSchema } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { criarAjudasAssistente } from './ajudas.service'
import { criarAssistenteEmpresa } from './empresa.service'

const tags = ['assistente']

/**
 * Assistente GrafyGo na empresa (/assistente…): os controles e o uso do mês (Configurações → Assistente) e as ajudas
 * internas. Cada ajuda exige a permissão de quem faria a tarefa à mão (montar orçamento, cadastrar produto…).
 */
export const assistenteEmpresaRoutes: FastifyPluginAsyncZod = async (app) => {
  const empresa = criarAssistenteEmpresa(app)
  const ajudas = criarAjudasAssistente(app)
  // Uma IA por clique: limite generoso por pessoa (as descrições em lote vão uma a uma)
  const limite = (max: number) => ({ rateLimit: { max, timeWindow: '1 minute' } })

  /** Alguma das permissões (ex.: orçamento novo ou edição de um existente) */
  async function exigirAlguma(request: FastifyRequest, opcoes: [Modulo, Acao][]) {
    for (const [modulo, acao] of opcoes) if (await app.temPermissao(request, modulo, acao)) return
    throw AppError.semPermissao()
  }

  // Qualquer usuário logado: as telas precisam saber se mostram os botões do Assistente
  app.get('/', { onRequest: [app.autenticar], schema: { tags, summary: 'Controles do Assistente na empresa, o que está liberado e o uso do mês' } }, () => empresa.obter())
  app.put(
    '/',
    { onRequest: [app.exigirPermissao('configuracoes', 'editar')], schema: { tags, summary: 'Liga e desliga o Assistente e cada ajuda', body: controlesAssistenteSchema } },
    (request) => empresa.salvar(request.body, request.user.sub),
  )

  app.post(
    '/orcamento-texto',
    { onRequest: [app.autenticar], config: limite(20), schema: { tags, summary: 'Monta itens de orçamento a partir do pedido do cliente (não salva)', body: orcamentoDeTextoSchema } },
    async (request) => {
      await exigirAlguma(request, [['orcamentos', 'criar'], ['orcamentos', 'editar']])
      return ajudas.orcamentoDeTexto(request.body.texto)
    },
  )
  app.post(
    '/produto-texto',
    { onRequest: [app.autenticar], config: limite(20), schema: { tags, summary: 'Sugere o cadastro de um produto a partir da descrição (não salva)', body: produtoDeTextoSchema } },
    async (request) => {
      await exigirAlguma(request, [['produtos', 'criar'], ['produtos', 'editar']])
      return ajudas.produtoDeTexto(request.body.texto)
    },
  )
  app.post(
    '/regras-texto',
    {
      onRequest: [app.exigirPermissao('configuracoes', 'editar')],
      config: limite(20),
      schema: { tags, summary: 'Lê como o dono dá desconto e preenche as perguntas das regras comerciais (não salva)', body: regrasDeTextoSchema },
    },
    (request) => ajudas.regrasDeTexto(request.body.texto),
  )
  app.post(
    '/descricao',
    { onRequest: [app.autenticar], config: limite(60), schema: { tags, summary: 'Escreve a descrição do produto ou o texto da vitrine (não salva)', body: descricaoAssistenteSchema } },
    async (request) => {
      await exigirAlguma(request, request.body.destino === 'vitrine' ? [['vitrine', 'editar'], ['produtos', 'editar']] : [['produtos', 'criar'], ['produtos', 'editar']])
      return ajudas.descricao(request.body)
    },
  )
}
