import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { buscaGlobalQuerySchema, idParamSchema, notificacoesQuerySchema } from '@onprint/shared'
import { criarBuscaService } from './busca.service'
import { criarDashboardService } from './dashboard.service'

/** Dashboard, busca global (Ctrl+K) e central de notificações do usuário logado. */
export const dashboardRoutes: FastifyPluginAsyncZod = async (app) => {
  const dashboard = criarDashboardService(app)
  const busca = criarBuscaService(app)
  const autenticado = { onRequest: [app.autenticar] }
  const { prisma } = app

  app.get('/dashboard', { onRequest: [app.exigirPermissao('dashboard', 'visualizar')], schema: { tags: ['dashboard'], summary: 'KPIs, gráficos e listas do dashboard' } }, (req) =>
    dashboard.montar(req),
  )
  app.get('/busca', { ...autenticado, schema: { tags: ['dashboard'], summary: 'Busca global: clientes, orçamentos e pedidos (respeita permissões)', querystring: buscaGlobalQuerySchema } }, (req) =>
    busca.buscar(req, req.query.q),
  )

  app.get('/notificacoes', { ...autenticado, schema: { tags: ['notificacoes'], summary: 'Notificações do usuário', querystring: notificacoesQuerySchema } }, async (req) => {
    const where = { usuarioId: req.user.sub, ...(req.query.naoLidas === 'true' ? { lida: false } : {}) }
    const [total, naoLidas, data] = await Promise.all([
      prisma.notificacao.count({ where }),
      prisma.notificacao.count({ where: { usuarioId: req.user.sub, lida: false } }),
      prisma.notificacao.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (req.query.page - 1) * req.query.pageSize, take: req.query.pageSize }),
    ])
    return { data, meta: { page: req.query.page, pageSize: req.query.pageSize, total }, naoLidas }
  })
  app.get('/notificacoes/contagem', { ...autenticado, schema: { tags: ['notificacoes'], summary: 'Quantas não lidas' } }, async (req) => ({
    naoLidas: await prisma.notificacao.count({ where: { usuarioId: req.user.sub, lida: false } }),
  }))
  app.post('/notificacoes/:id/lida', { ...autenticado, schema: { tags: ['notificacoes'], summary: 'Marca como lida', params: idParamSchema } }, async (req) => {
    const r = await prisma.notificacao.updateMany({ where: { id: req.params.id, usuarioId: req.user.sub }, data: { lida: true } })
    return { atualizadas: r.count }
  })
  app.post('/notificacoes/lidas', { ...autenticado, schema: { tags: ['notificacoes'], summary: 'Marca todas como lidas', body: z.object({}).optional() } }, async (req) => {
    const r = await prisma.notificacao.updateMany({ where: { usuarioId: req.user.sub, lida: false }, data: { lida: true } })
    return { atualizadas: r.count }
  })
}
