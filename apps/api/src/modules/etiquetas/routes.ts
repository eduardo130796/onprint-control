import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { filaEtiquetasAdicionarSchema, filaEtiquetasIdsSchema, idParamSchema } from '@onprint/shared'
import { criarFilaEtiquetasService } from './fila.service'

const tags = ['etiquetas']

/**
 * Fila de etiquetas de entrega: quem vê a produção acompanha e imprime (imprimir etiqueta é tarefa
 * do balcão e da expedição, não exige mover OP). No modo só leitura as gravações já ficam bloqueadas.
 */
export const etiquetasRoutes: FastifyPluginAsyncZod = async (app) => {
  const fila = criarFilaEtiquetasService(app)
  const pode = { onRequest: [app.exigirPermissao('producao', 'visualizar')] }

  app.get('/etiquetas/fila', { ...pode, schema: { tags, summary: 'Etiquetas pendentes de impressão' } }, () => fila.listar())
  app.post('/etiquetas/fila', { ...pode, schema: { tags, summary: 'Adiciona OPs (ou pedidos inteiros) à fila', body: filaEtiquetasAdicionarSchema } }, (req) =>
    fila.adicionar(req.body.opIds, req.body.pedidoIds, req.user.sub),
  )
  app.delete('/etiquetas/fila/:id', { ...pode, schema: { tags, summary: 'Tira uma etiqueta da fila', params: idParamSchema } }, async (req, reply) => {
    await fila.remover(req.params.id)
    return reply.status(204).send()
  })
  app.post('/etiquetas/fila/marcar-impressas', { ...pode, schema: { tags, summary: 'Marca etiquetas como impressas (saem da fila)', body: filaEtiquetasIdsSchema } }, (req) =>
    fila.marcarImpressas(req.body.ids),
  )
  app.post('/etiquetas/fila/voltar', { ...pode, schema: { tags, summary: 'Desfaz o "marcar como impressas"', body: filaEtiquetasIdsSchema } }, (req) =>
    fila.voltarParaFila(req.body.ids),
  )
}
