import type { FastifyInstance, FastifyRequest, RawServerDefault } from 'fastify'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { FastifyBaseLogger } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import type { z } from 'zod'
import { idParamSchema, type Modulo } from '@onprint/shared'

type AppZod = FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse, FastifyBaseLogger, ZodTypeProvider>

interface ServicoCrud<TDados, TQuery> {
  listar(q: TQuery): Promise<unknown>
  obter(id: string): Promise<unknown>
  criar(dados: TDados, usuarioId: string): Promise<unknown>
  atualizar(id: string, dados: TDados, usuarioId: string): Promise<unknown>
  alterarAtivo(id: string, ativo: boolean, usuarioId: string): Promise<unknown>
}

interface OpcoesRotasCrud<S extends z.ZodTypeAny, Q extends z.ZodTypeAny> {
  modulo: Modulo
  tags: string[]
  /** "acabamento", "máquina"… (resumo no Swagger) */
  nome: string
  corpo: S
  query: Q
  service: ServicoCrud<z.output<S>, z.output<Q>>
}

/**
 * Rotas REST padrão de um cadastro: GET / (lista), GET /:id, POST /, PUT /:id,
 * DELETE /:id (desativa) e POST /:id/reativar — todas com permissão do módulo.
 * O "controller" aqui só repassa request → service.
 */
export function registrarRotasCrud<S extends z.ZodTypeAny, Q extends z.ZodTypeAny>(app: AppZod, o: OpcoesRotasCrud<S, Q>) {
  const pode = (acao: 'visualizar' | 'criar' | 'editar' | 'excluir') => ({ onRequest: [app.exigirPermissao(o.modulo, acao)] })
  const autor = (req: FastifyRequest) => req.user.sub
  const tags = o.tags

  app.get('/', { ...pode('visualizar'), schema: { tags, summary: `Lista ${o.nome}s`, querystring: o.query } }, (req) =>
    o.service.listar(req.query as z.output<Q>),
  )
  app.get('/:id', { ...pode('visualizar'), schema: { tags, summary: `Detalhe de ${o.nome}`, params: idParamSchema } }, (req) =>
    o.service.obter(req.params.id),
  )
  app.post('/', { ...pode('criar'), schema: { tags, summary: `Cria ${o.nome}`, body: o.corpo } }, async (req, reply) =>
    reply.status(201).send(await o.service.criar(req.body as z.output<S>, autor(req))),
  )
  app.put('/:id', { ...pode('editar'), schema: { tags, summary: `Atualiza ${o.nome}`, params: idParamSchema, body: o.corpo } }, (req) =>
    o.service.atualizar(req.params.id, req.body as z.output<S>, autor(req)),
  )
  app.delete('/:id', { ...pode('excluir'), schema: { tags, summary: `Desativa ${o.nome}`, params: idParamSchema } }, (req) =>
    o.service.alterarAtivo(req.params.id, false, autor(req)),
  )
  app.post('/:id/reativar', { ...pode('editar'), schema: { tags, summary: `Reativa ${o.nome}`, params: idParamSchema } }, (req) =>
    o.service.alterarAtivo(req.params.id, true, autor(req)),
  )
}

export type { AppZod }
