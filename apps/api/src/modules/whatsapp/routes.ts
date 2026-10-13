import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest } from 'fastify'
import { idParamSchema, mensagensWhatsappQuerySchema, whatsappConfigSchema } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { criarWhatsappService } from './service'

const tags = ['whatsapp']

/** WhatsApp da gráfica: conexão pelo QR code e avisos automáticos dos pedidos */
export const whatsappRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = criarWhatsappService(app)
  const pode = (acao: 'visualizar' | 'editar') => ({ onRequest: [app.exigirPermissao('whatsapp', acao)] })

  /** A tela abre mesmo fora do plano (avisa "fale com a GrafyGo para liberar") */
  async function podeVer(req: FastifyRequest) {
    await app.autenticar(req)
    if (!(await app.permissoesDoPapel(req.user.papelId)).has('whatsapp:visualizar')) throw AppError.semPermissao()
  }

  app.get('/whatsapp', { onRequest: [podeVer], schema: { tags, summary: 'Configuração e conexão (último estado conhecido)' } }, () => service.obter())
  app.put('/whatsapp', { ...pode('editar'), schema: { tags, summary: 'Eventos ligados, horário de envio e pausa', body: whatsappConfigSchema } }, (req) =>
    service.salvar(req.body, req.user.sub),
  )
  app.get('/whatsapp/estado', { ...pode('visualizar'), schema: { tags, summary: 'Consulta a conexão agora (a tela repete enquanto mostra o QR)' } }, () => service.estado())
  app.post('/whatsapp/conectar', { ...pode('editar'), schema: { tags, summary: 'Cria a conexão e devolve o QR code (base64)' } }, (req) => service.conectar(req.user.sub))
  app.post('/whatsapp/desconectar', { ...pode('editar'), schema: { tags, summary: 'Sai do WhatsApp (novos avisos deixam de entrar na fila)' } }, (req) =>
    service.desconectar(req.user.sub),
  )
  app.get('/whatsapp/mensagens', { ...pode('visualizar'), schema: { tags, summary: 'Avisos na fila e enviados, do mais novo ao mais antigo', querystring: mensagensWhatsappQuerySchema } }, (req) =>
    service.mensagens(req.query),
  )
  app.post('/whatsapp/mensagens/:id/reenviar', { ...pode('editar'), schema: { tags, summary: 'Coloca o aviso de volta na fila', params: idParamSchema } }, (req) =>
    service.reenviar(req.params.id),
  )
  app.post('/whatsapp/mensagens/:id/ignorar', { ...pode('editar'), schema: { tags, summary: 'Tira o aviso da fila', params: idParamSchema } }, (req) =>
    service.ignorar(req.params.id),
  )
}
