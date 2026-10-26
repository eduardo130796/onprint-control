import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest } from 'fastify'
import {
  ANEXO_WHATSAPP_MAX_MB,
  contatosWhatsappQuerySchema,
  conversasWhatsappQuerySchema,
  envioWhatsappSchema,
  idParamSchema,
  mensagemPedidoQuerySchema,
  mensagensWhatsappQuerySchema,
  vincularConversaSchema,
  whatsappConfigSchema,
} from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { criarConversasWhatsapp } from './conversas.service'
import { PERMISSOES_ENVIO, criarEnvioManual, validarPdf, type DadosEnvio } from './manual'
import { textoMensagemPedido } from './mensagem-pedido'
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

  // ─── Conversas do WhatsApp (copiloto nível 1): mensagens dos clientes com as ações de um toque ───
  const conversas = criarConversasWhatsapp(app)

  app.get('/whatsapp/conversas', { ...pode('visualizar'), schema: { tags, summary: 'Conversas recebidas (abertas ou resolvidas), da mais recente', querystring: conversasWhatsappQuerySchema } }, (req) =>
    conversas.listar(req.query),
  )
  app.get('/whatsapp/conversas/contagem', { ...pode('visualizar'), schema: { tags, summary: 'Quantas conversas estão abertas (contador do menu)' } }, () => conversas.contar())
  app.post(
    '/whatsapp/conversas/:id/orcamento',
    { onRequest: [app.exigirPermissao('whatsapp', 'visualizar'), app.exigirPermissao('orcamentos', 'criar')], schema: { tags, summary: 'Monta o orçamento com o texto da conversa (nada é salvo)', params: idParamSchema } },
    (req) => conversas.montarOrcamento(req.params.id),
  )
  app.get('/whatsapp/conversas/:id/pedidos', { ...pode('visualizar'), schema: { tags, summary: 'Pedidos em andamento do cliente e a resposta pronta', params: idParamSchema } }, (req) =>
    conversas.pedidos(req.params.id),
  )
  app.post('/whatsapp/conversas/:id/resolver', { ...pode('visualizar'), schema: { tags, summary: 'Marca a conversa como resolvida', params: idParamSchema } }, (req) =>
    conversas.resolver(req.params.id, req.user.sub),
  )
  app.post('/whatsapp/conversas/:id/reabrir', { ...pode('visualizar'), schema: { tags, summary: 'Desfaz o "resolvida"', params: idParamSchema } }, (req) => conversas.reabrir(req.params.id))
  app.post(
    '/whatsapp/conversas/:id/vincular',
    { onRequest: [app.exigirPermissao('orcamentos', 'criar')], schema: { tags, summary: 'Liga a conversa ao orçamento montado a partir dela (e resolve)', params: idParamSchema, body: vincularConversaSchema } },
    (req) => conversas.vincular(req.params.id, req.body.orcamentoId, req.user.sub),
  )

  /** Contatos pelo nome (sem copiar número): quem atende o WhatsApp, faz orçamento ou vê clientes */
  async function podeVerContatos(req: FastifyRequest) {
    await app.autenticar(req)
    for (const [modulo, acao] of [['whatsapp', 'visualizar'], ['orcamentos', 'criar'], ['clientes', 'visualizar']] as const) if (await app.temPermissao(req, modulo, acao)) return
    throw AppError.semPermissao()
  }
  app.get('/whatsapp/contatos', { onRequest: [podeVerContatos], schema: { tags, summary: 'Contatos do WhatsApp pelo nome ou número (conversas recebidas e clientes)', querystring: contatosWhatsappQuerySchema } }, (req) =>
    conversas.contatos(req.query.busca),
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
  app.get(
    '/whatsapp/pedidos/:id/mensagem',
    {
      onRequest: [app.exigirPermissao('pedidos', 'visualizar')],
      schema: { tags, summary: 'Texto da mensagem do pedido (o mesmo do aviso automático) para o "Enviar pelo WhatsApp"', params: idParamSchema, querystring: mensagemPedidoQuerySchema },
    },
    async (req) => {
      const texto = await textoMensagemPedido(app.prisma, contextoEmpresa.exigir(), req.params.id, req.query.tipo)
      if (texto === null) throw AppError.naoEncontrado('Pedido não encontrado.')
      return { texto }
    },
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
