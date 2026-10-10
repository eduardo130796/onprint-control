import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest } from 'fastify'
import { z } from 'zod'
import { idParamSchema, ordemImagensSchema, produtoVitrineSchema, produtosVitrineQuerySchema, vitrineConfigSchema } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { criarArquivosService } from '../arquivos/service'
import { LARGURAS_IMAGEM, enviarImagem } from './imagens'
import { criarVitrineService } from './vitrine.service'

const tags = ['vitrine']
const larguraQuery = z.object({ w: z.enum(LARGURAS_IMAGEM).default('480') })
const ordemBannersSchema = z.object({ ids: z.array(z.string().uuid()).max(3) })

/** Vitrine online — área logada (docs/VITRINE.md, seção 3) */
export const vitrineRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = criarVitrineService(app, criarArquivosService(app))
  const pode = (acao: 'visualizar' | 'editar') => ({ onRequest: [app.exigirPermissao('vitrine', acao)] })

  /** Galeria do produto: quem edita produtos ou a vitrine */
  async function podeGaleria(req: FastifyRequest) {
    await app.autenticar(req)
    if (!(await app.temPermissao(req, 'produtos', 'editar')) && !(await app.temPermissao(req, 'vitrine', 'editar'))) throw AppError.semPermissao()
  }

  /** A configuração abre mesmo fora do plano (a tela avisa "fale com a GrafyGo para liberar") */
  async function podeVerConfig(req: FastifyRequest) {
    await app.autenticar(req)
    if (!(await app.permissoesDoPapel(req.user.papelId)).has('vitrine:visualizar')) throw AppError.semPermissao()
  }

  app.get('/vitrine/config', { onRequest: [podeVerConfig], schema: { tags, summary: 'Configuração da vitrine (endereço público, banners, se o plano inclui)' } }, () => service.obterConfig())
  app.put('/vitrine/config', { ...pode('editar'), schema: { tags, summary: 'Salva a configuração da vitrine', body: vitrineConfigSchema } }, (req) =>
    service.atualizarConfig(req.body, req.user.sub),
  )

  app.post(
    '/vitrine/banners',
    { ...pode('editar'), schema: { tags, summary: 'Envia uma imagem do banner (multipart, PNG/JPG, até 3)', consumes: ['multipart/form-data'] } },
    async (req, reply) => reply.status(201).send(await service.enviarBanner(req, req.user.sub)),
  )
  app.delete(
    '/vitrine/banners/:arquivoId',
    { ...pode('editar'), schema: { tags, summary: 'Remove uma imagem do banner', params: z.object({ arquivoId: z.string().uuid() }) } },
    (req) => service.removerBanner(req.params.arquivoId, req.user.sub),
  )
  // Quem vê a vitrine pode mandar o catálogo (vendedor no WhatsApp)
  app.post(
    '/vitrine/catalogos',
    { ...pode('visualizar'), schema: { tags, summary: 'Guarda o PDF do catálogo para mandar por link (multipart, PDF)', consumes: ['multipart/form-data'] } },
    async (req, reply) => reply.status(201).send(await service.publicarCatalogo(req, req.user.sub)),
  )
  app.put('/vitrine/banners/ordem', { ...pode('editar'), schema: { tags, summary: 'Reordena o banner', body: ordemBannersSchema } }, (req) => service.ordenarBanners(req.body.ids))

  app.get('/vitrine/produtos', { ...pode('visualizar'), schema: { tags, summary: 'Produtos e serviços ativos com os dados da vitrine', querystring: produtosVitrineQuerySchema } }, (req) =>
    service.listarProdutos(req.query),
  )
  app.patch(
    '/produtos/:id/vitrine',
    { ...pode('editar'), schema: { tags, summary: 'Publica/edita o produto na vitrine (slug vazio = gerado do nome)', params: idParamSchema, body: produtoVitrineSchema } },
    (req) => service.atualizarProduto(req.params.id, req.body, req.user.sub),
  )

  // Galeria (a primeira imagem é a capa do produto em todo o sistema)
  app.get('/produtos/:id/imagens', { onRequest: [podeGaleria], schema: { tags, summary: 'Galeria do produto', params: idParamSchema } }, (req) => service.galeria(req.params.id))
  app.post(
    '/produtos/:id/imagens',
    { onRequest: [podeGaleria], schema: { tags, summary: 'Envia uma imagem para a galeria (multipart, PNG/JPG)', params: idParamSchema, consumes: ['multipart/form-data'] } },
    async (req, reply) => reply.status(201).send(await service.enviarImagem(req, req.params.id, req.user.sub)),
  )
  app.delete(
    '/produtos/:id/imagens/:imagemId',
    { onRequest: [podeGaleria], schema: { tags, summary: 'Remove uma imagem da galeria', params: z.object({ id: z.string().uuid(), imagemId: z.string().uuid() }) } },
    (req) => service.removerImagem(req.params.id, req.params.imagemId, req.user.sub),
  )
  app.put(
    '/produtos/:id/imagens/ordem',
    { onRequest: [podeGaleria], schema: { tags, summary: 'Reordena a galeria (a primeira vira a capa)', params: idParamSchema, body: ordemImagensSchema } },
    (req) => service.ordenarImagens(req.params.id, req.body.ids),
  )

  // Miniatura para a área logada, por link assinado (o <img> não manda o token de login)
  app.get(
    '/vitrine/miniaturas/:token',
    { schema: { tags, summary: 'Miniatura WebP por link temporário', params: z.object({ token: z.string().max(300) }), querystring: larguraQuery } },
    async (req, reply) => {
      const alvo = app.storage.validarTokenTemporario(req.params.token)
      const empresa = alvo && (await app.empresas.porId(alvo.empresaId))
      if (!alvo || !empresa) throw AppError.naoEncontrado('Imagem não encontrada.')
      contextoEmpresa.definir(empresa)
      const arquivo = await app.prisma.arquivo.findUnique({ where: { id: alvo.arquivoId }, select: { caminho: true } })
      if (!arquivo) throw AppError.naoEncontrado('Imagem não encontrada.')
      return enviarImagem(app.storage, reply, arquivo, req.query.w, 'private')
    },
  )
}
