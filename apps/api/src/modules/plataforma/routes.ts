import argon2 from 'argon2'
import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { CODIGOS_ERRO, acaoAssinaturaSchema, cupomSchema, empresasPlataformaQuerySchema, idParamSchema, loginSchema, novaEmpresaSchema, planoSchema } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { conciliarAssinaturas } from '../../plataforma/cobrancas'
import { LOGIN_JANELA_MS, LOGIN_MAX_FALHAS, MSG_LOGIN_TRAVADO, criarContadorTentativas } from '../auth/tentativas'
import { criarCuponsService } from './cupons.service'
import { criarEmpresasPlataformaService } from './empresas.service'
import { criarPainelService } from './painel.service'
import { criarPlanosService } from './planos.service'

const tags = ['plataforma']
/** Sessão do painel: token curto de trabalho, sem renovação (o suporte entra de novo depois de 8 h). */
const VALIDADE_TOKEN = '8h'

/** Painel da plataforma (dono do sistema / suporte): login próprio e rotas protegidas por ele. */
export const plataformaRoutes: FastifyPluginAsyncZod = async (app) => {
  const painel = criarPainelService(app)
  const empresas = criarEmpresasPlataformaService(app)
  const planos = criarPlanosService(app)
  const cupons = criarCuponsService(app)
  const protegida = { onRequest: [app.autenticarPlataforma] }
  let hashFicticio: Promise<string> | undefined
  // Senhas erradas por e-mail, de qualquer IP (o limite da rota é por IP)
  const falhasLogin = criarContadorTentativas({ max: LOGIN_MAX_FALHAS, janelaMs: LOGIN_JANELA_MS })

  const adminDa = async (request: FastifyRequest) => {
    const admin = await app.plataforma.adminPlataforma.findUnique({ where: { id: request.user.sub }, select: { id: true, nome: true, email: true } })
    if (!admin) throw AppError.naoAutenticado()
    return admin
  }

  app.post(
    '/auth/login',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, schema: { tags, summary: 'Login do administrador da plataforma', body: loginSchema } },
    async (request) => {
      const { email } = request.body
      if (falhasLogin.bloqueado(email)) throw new AppError(429, CODIGOS_ERRO.MUITAS_TENTATIVAS, MSG_LOGIN_TRAVADO)
      const admin = await app.plataforma.adminPlataforma.findUnique({ where: { email } })
      // Mesmo tempo de resposta exista ou não o e-mail
      const ok = await argon2.verify(admin?.senhaHash ?? (await (hashFicticio ??= argon2.hash('senha-ficticia-plataforma'))), request.body.senha)
      if (!admin || !ok || !admin.ativo) {
        falhasLogin.registrar(email)
        throw AppError.naoAutenticado('E-mail ou senha inválidos.')
      }
      falhasLogin.limpar(email)
      await app.plataforma.adminPlataforma.update({ where: { id: admin.id }, data: { ultimoLogin: new Date() } })
      const accessToken = app.jwt.sign({ sub: admin.id, plat: true } as never, { expiresIn: VALIDADE_TOKEN })
      return { accessToken, admin: { id: admin.id, nome: admin.nome, email: admin.email } }
    },
  )
  app.get('/auth/me', { ...protegida, schema: { tags, summary: 'Administrador logado' } }, adminDa)

  app.get('/painel', { ...protegida, schema: { tags, summary: 'Indicadores e problemas' } }, () => painel.obter())

  app.get('/empresas', { ...protegida, schema: { tags, summary: 'Empresas assinantes', querystring: empresasPlataformaQuerySchema } }, (request) => empresas.listar(request.query))
  app.get('/empresas/:id', { ...protegida, schema: { tags, summary: 'Ficha da empresa', params: idParamSchema } }, (request) => empresas.obter(request.params.id))
  app.post('/empresas', { ...protegida, schema: { tags, summary: 'Cria uma empresa (convite ao dono por e-mail)', body: novaEmpresaSchema } }, async (request, reply) =>
    reply.status(201).send(await empresas.criar(request.body)),
  )
  app.post(
    '/empresas/:id/acoes',
    { ...protegida, schema: { tags, summary: 'Ação do suporte na assinatura (plano, liberar, bloquear, cancelar…)', params: idParamSchema, body: acaoAssinaturaSchema } },
    async (request) => {
      await empresas.acao(request.params.id, request.body, (await adminDa(request)).email)
      return empresas.obter(request.params.id)
    },
  )

  app.get('/planos', { ...protegida, schema: { tags, summary: 'Planos' } }, () => planos.listar())
  app.post('/planos', { ...protegida, schema: { tags, summary: 'Cria plano', body: planoSchema } }, async (request, reply) => reply.status(201).send(await planos.salvar(null, request.body)))
  app.put('/planos/:id', { ...protegida, schema: { tags, summary: 'Atualiza plano', params: idParamSchema, body: planoSchema } }, (request) =>
    planos.salvar(request.params.id, request.body),
  )

  app.get('/cupons', { ...protegida, schema: { tags, summary: 'Cupons de desconto (usos, desconto concedido, receita)' } }, () => cupons.listar())
  app.get('/cupons/:id', { ...protegida, schema: { tags, summary: 'Cupom e as empresas que usaram', params: idParamSchema } }, (request) => cupons.obter(request.params.id))
  app.post('/cupons', { ...protegida, schema: { tags, summary: 'Cria cupom', body: cupomSchema } }, async (request, reply) => reply.status(201).send(await cupons.criar(request.body)))
  app.put('/cupons/:id', { ...protegida, schema: { tags, summary: 'Atualiza (ou pausa) cupom', params: idParamSchema, body: cupomSchema } }, (request) =>
    cupons.atualizar(request.params.id, request.body),
  )

  app.get(
    '/eventos-gateway',
    { ...protegida, schema: { tags, summary: 'Avisos recebidos do gateway', querystring: z.object({ erro: z.enum(['true', 'false']).optional() }) } },
    (request) => planos.eventosGateway(request.query.erro === 'true'),
  )
  app.post('/eventos-gateway/:id/reprocessar', { ...protegida, schema: { tags, summary: 'Aplica de novo um aviso com erro', params: idParamSchema } }, async (request) => {
    await planos.reprocessar(request.params.id)
    return { ok: true }
  })
  app.post('/conciliar', { ...protegida, schema: { tags, summary: 'Confere agora todas as assinaturas com o gateway' } }, () => conciliarAssinaturas(app))
}
