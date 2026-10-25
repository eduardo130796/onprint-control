import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest } from 'fastify'
import { z } from 'zod'
import { idParamSchema, manualAtendenteSchema, ordemRegrasSchema, regraAtivaSchema, regraComercialSchema, simulacaoRegrasSchema, type Acao, type Modulo } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { criarRegrasService } from './service'

const tags = ['regras-comerciais']

/** Simulador: a regra em edição (ainda não salva) pode entrar no lugar da gravada */
const simulacaoSchema = simulacaoRegrasSchema.extend({ regra: regraComercialSchema.extend({ id: z.string().uuid().nullable().optional() }).nullable().optional() })

/**
 * Regras comerciais (/regras-comerciais). Ver e simular: quem orça ou quem mexe nas configurações (o vendedor vê "o
 * que vale hoje"); criar, editar, ordenar e o manual do atendente: configurações:editar.
 */
export const regrasRoutes: FastifyPluginAsyncZod = async (app) => {
  const s = criarRegrasService(app)
  const editar = { onRequest: [app.exigirPermissao('configuracoes', 'editar')] }

  async function exigirAlguma(request: FastifyRequest, opcoes: [Modulo, Acao][]) {
    await app.autenticar(request)
    for (const [modulo, acao] of opcoes) if (await app.temPermissao(request, modulo, acao)) return
    throw AppError.semPermissao()
  }
  const ver = { onRequest: [(req: FastifyRequest) => exigirAlguma(req, [['configuracoes', 'visualizar'], ['orcamentos', 'visualizar']])] }

  app.get('/', { ...ver, schema: { tags, summary: 'Regras comerciais na ordem, com a frase "Quando… → …"' } }, () => s.listar())
  app.post('/', { ...editar, schema: { tags, summary: 'Cria regra (vai para o fim da ordem)', body: regraComercialSchema } }, async (req, reply) =>
    reply.status(201).send(await s.criar(req.body, req.user.sub)),
  )
  app.put('/ordem', { ...editar, schema: { tags, summary: 'Nova ordem (prioridade) de todas as regras', body: ordemRegrasSchema } }, (req) => s.ordenar(req.body.ids, req.user.sub))
  app.put('/:id', { ...editar, schema: { tags, summary: 'Atualiza regra', params: idParamSchema, body: regraComercialSchema } }, (req) => s.atualizar(req.params.id, req.body, req.user.sub))
  app.patch('/:id/ativa', { ...editar, schema: { tags, summary: 'Liga ou desliga a regra', params: idParamSchema, body: regraAtivaSchema } }, (req) =>
    s.ativar(req.params.id, req.body.ativa, req.user.sub),
  )
  app.delete('/:id', { ...editar, schema: { tags, summary: 'Exclui regra', params: idParamSchema } }, async (req, reply) => {
    await s.remover(req.params.id, req.user.sub)
    return reply.status(204).send()
  })
  app.post('/simular', { ...ver, config: { rateLimit: { max: 120, timeWindow: '1 minute' } }, schema: { tags, summary: 'Simulador: produtos, cliente, pagamento e data → regras e preço final', body: simulacaoSchema } }, (req) => {
    const { regra, ...d } = req.body
    return s.simular(d, { usuarioId: req.user.sub }, regra ? { ...regra, id: regra.id ?? 'nova', prioridade: Number.MAX_SAFE_INTEGER } : null)
  })

  app.get('/manual', { ...ver, schema: { tags, summary: 'Manual do atendente (orientações livres para o Assistente)' } }, () => s.obterManual())
  app.put('/manual', { ...editar, schema: { tags, summary: 'Salva o manual do atendente', body: manualAtendenteSchema } }, (req) => s.salvarManual(req.body.manualAtendente, req.user.sub))
}
