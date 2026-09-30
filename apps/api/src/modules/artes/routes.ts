import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest } from 'fastify'
import { z } from 'zod'
import { arteAprovacaoInternaSchema, arteComentarioSchema, idParamSchema } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { contextoUsuario } from '../../core/escopo'
import { criarArquivosService } from '../arquivos/service'
import { criarArtesService } from './artes.service'

const tags = ['artes']

export const artesRoutes: FastifyPluginAsyncZod = async (app) => {
  const artes = criarArtesService(app, criarArquivosService(app))
  const ctx = (req: FastifyRequest) => contextoUsuario(app, req, 'artes')
  const pode = (acao: 'visualizar' | 'editar' | 'aprovar') => ({ onRequest: [app.exigirPermissao('artes', acao)] })
  // Comentário: equipe de arte ou quem cuida do pedido (vendedor conversa com o designer pela arte)
  const podeComentar = {
    onRequest: [
      async (req: FastifyRequest) => {
        await app.autenticar(req)
        const [arte, pedido] = await Promise.all([app.temPermissao(req, 'artes', 'visualizar'), app.temPermissao(req, 'pedidos', 'editar')])
        if (!arte && !pedido) throw AppError.semPermissao()
      },
    ],
  }

  app.post(
    '/pedidos/itens/:itemId/artes',
    {
      ...pode('editar'),
      schema: { tags, summary: 'Envia o arquivo da arte (nova versão se a atual já tem arquivo)', params: z.object({ itemId: z.string().uuid() }), consumes: ['multipart/form-data'] },
    },
    async (req, reply) => reply.status(201).send(await artes.enviarArquivo(req, req.params.itemId, await ctx(req))),
  )
  app.get('/artes/:id', { ...pode('visualizar'), schema: { tags, summary: 'Versão da arte com comentários', params: idParamSchema } }, (req) => artes.obter(req.params.id))
  app.post('/artes/:id/enviar', { ...pode('editar'), schema: { tags, summary: 'Envia a arte para aprovação do cliente', params: idParamSchema } }, async (req) =>
    artes.enviarAoCliente(req.params.id, await ctx(req)),
  )
  app.post(
    '/artes/:id/aprovar',
    { ...pode('aprovar'), schema: { tags, summary: 'Registra a aprovação do cliente (interna)', params: idParamSchema, body: arteAprovacaoInternaSchema } },
    async (req) => artes.aprovarInterno(req.params.id, req.body.nome, await ctx(req)),
  )
  app.post(
    '/artes/:id/comentarios',
    { ...podeComentar, schema: { tags, summary: 'Comentário interno na arte', params: idParamSchema, body: arteComentarioSchema } },
    async (req) => artes.comentar(req.params.id, req.body.texto, await ctx(req)),
  )
}
