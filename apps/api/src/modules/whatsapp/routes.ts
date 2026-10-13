import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest } from 'fastify'
import { ANEXO_WHATSAPP_MAX_MB, envioWhatsappSchema, idParamSchema, mensagensWhatsappQuerySchema, whatsappConfigSchema } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { PERMISSOES_ENVIO, criarEnvioManual, validarPdf, type DadosEnvio } from './manual'
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

  // ─── "Enviar pelo WhatsApp" da equipe (orçamento, arte, pedido, catálogo, produto) ───
  const enviarManual = criarEnvioManual(app)

  /** Basta uma das permissões do tipo (ex.: o designer manda a arte sem ter a tela WhatsApp) */
  async function podeEnviar(req: FastifyRequest, dados: DadosEnvio) {
    for (const [modulo, acao] of PERMISSOES_ENVIO[dados.tipo]) if (await app.temPermissao(req, modulo, acao)) return
    throw AppError.semPermissao()
  }

  app.get('/whatsapp/disponivel', { onRequest: [app.autenticar], schema: { tags, summary: 'Se o "Enviar pelo WhatsApp" sai pela conexão da gráfica ou abre o WhatsApp' } }, () =>
    service.disponivel(),
  )
  app.post(
    '/whatsapp/enviar',
    { onRequest: [app.autenticar], schema: { tags, summary: 'Envia agora pela conexão da gráfica e registra (respeita a pausa, não o horário)', body: envioWhatsappSchema } },
    async (req) => {
      await podeEnviar(req, req.body)
      return enviarManual(req.body, null, req.user.sub)
    },
  )
  app.post(
    '/whatsapp/enviar-com-pdf',
    {
      onRequest: [app.autenticar],
      schema: { tags, summary: `Como /whatsapp/enviar, com um PDF (multipart: campo "dados" com o JSON, depois o arquivo; até ${ANEXO_WHATSAPP_MAX_MB} MB)`, consumes: ['multipart/form-data'] },
    },
    async (req) => {
      const parte = await req.file({ limits: { fileSize: ANEXO_WHATSAPP_MAX_MB * 1024 * 1024, files: 1 } })
      if (!parte) throw AppError.regraNegocio('Nenhum arquivo enviado.')
      const campo = parte.fields.dados
      const json = campo && !Array.isArray(campo) && campo.type === 'field' ? String(campo.value) : ''
      let bruto: unknown = null
      try {
        bruto = JSON.parse(json)
      } catch {
        // validação abaixo responde
      }
      const dados = envioWhatsappSchema.safeParse(bruto)
      if (!dados.success) {
        parte.file.resume()
        throw new AppError(400, 'VALIDACAO', 'Dados inválidos.', dados.error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })))
      }
      await podeEnviar(req, dados.data).catch((erro: unknown) => {
        parte.file.resume()
        throw erro
      })
      let conteudo: Buffer
      try {
        conteudo = await parte.toBuffer()
      } catch {
        throw new AppError(413, 'VALIDACAO', `O PDF passou de ${ANEXO_WHATSAPP_MAX_MB} MB.`)
      }
      return enviarManual(dados.data, validarPdf(conteudo, parte.filename), req.user.sub)
    },
  )
}
