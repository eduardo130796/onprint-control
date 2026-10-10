import Fastify, { type FastifyRequest } from 'fastify'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import type { Env } from './config/env'
import { API_PREFIX } from './core/constantes'
import { ocultarTokensDaUrl } from './core/tokens'
import { arquivosRoutes } from './modules/arquivos/routes'
import { authRoutes } from './modules/auth/routes'
import { clientesRoutes } from './modules/clientes/routes'
import { configuracoesRoutes } from './modules/configuracoes/routes'
import { consultasRoutes } from './modules/consultas/routes'
import { empresaRoutes } from './modules/empresa/routes'
import { fornecedoresRoutes } from './modules/fornecedores/routes'
import { orcamentosRoutes } from './modules/orcamentos/routes'
import { publicoRoutes } from './modules/publico/routes'
import { healthRoutes } from './modules/health/routes'
import { insumosRoutes } from './modules/insumos/routes'
import { artesRoutes } from './modules/artes/routes'
import { assinaturaRoutes } from './modules/assinatura/routes'
import { cadastroRoutes } from './modules/plataforma/cadastro'
import { plataformaRoutes } from './modules/plataforma/routes'
import { webhooksRoutes } from './modules/plataforma/webhooks'
import { pedidosRoutes } from './modules/pedidos/routes'
import { permissoesRoutes } from './modules/permissoes/routes'
import { producaoRoutes } from './modules/producao/routes'
import { etiquetasRoutes } from './modules/etiquetas/routes'
import { estoqueRoutes } from './modules/estoque/routes'
import { financeiroRoutes } from './modules/financeiro/routes'
import { caixaRoutes } from './modules/caixa/routes'
import { dashboardRoutes } from './modules/dashboard/routes'
import { relatoriosRoutes } from './modules/relatorios/routes'
import { produtosRoutes } from './modules/produtos/routes'
import { usuariosRoutes } from './modules/usuarios/routes'
import { vitrinePermitidaRoutes, vitrinePublicaRoutes } from './modules/vitrine/publico.routes'
import { vitrineRoutes } from './modules/vitrine/routes'
import { authPlugin } from './plugins/auth'
import { cronPlugin } from './plugins/cron'
import { integracoesPlugin } from './plugins/integracoes'
import { errorsPlugin } from './plugins/errors'
import { permissionsPlugin } from './plugins/permissions'
import { prismaPlugin } from './plugins/prisma'
import { socketPlugin } from './plugins/socket'
import { securityPlugin } from './plugins/security'
import { storagePlugin } from './plugins/storage'
import { swaggerPlugin } from './plugins/swagger'

declare module 'fastify' {
  interface FastifyInstance {
    config: Env
  }
}

export { API_PREFIX }

/** Monta a aplicação (sem abrir porta) — usado pelo server.ts e pelos testes. */
export async function buildApp(config: Env) {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      // O token do link de senha vai na URL: no log ele aparece como ***
      serializers: {
        req: (req: FastifyRequest) => ({ method: req.method, url: ocultarTokensDaUrl(req.url), host: req.host, remoteAddress: req.ip, remotePort: req.socket?.remotePort }),
      },
    },
    // Só o proxy da rede interna (Caddy no Docker) informa o IP real; X-Forwarded-For vindo de fora é ignorado
    trustProxy: 'loopback,linklocal,uniquelocal',
    // URL temporária de arquivo: {empresa}~{arquivo}.{validade}.{assinatura} passa do padrão (100)
    routerOptions: { maxParamLength: 300 },
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.decorate('config', config)

  await app.register(errorsPlugin)
  await app.register(securityPlugin)
  await app.register(swaggerPlugin)
  await app.register(prismaPlugin)
  await app.register(authPlugin)
  await app.register(permissionsPlugin)
  await app.register(storagePlugin)
  await app.register(integracoesPlugin)
  await app.register(cronPlugin)
  await app.register(socketPlugin)

  await app.register(healthRoutes)
  await app.register(
    async (v1) => {
      await v1.register(healthRoutes)
      await v1.register(authRoutes, { prefix: '/auth' })
      await v1.register(assinaturaRoutes)
      await v1.register(usuariosRoutes, { prefix: '/usuarios' })
      await v1.register(permissoesRoutes, { prefix: '/permissoes' })
      await v1.register(empresaRoutes, { prefix: '/empresa' })
      await v1.register(configuracoesRoutes)
      await v1.register(arquivosRoutes, { prefix: '/arquivos' })
      await v1.register(clientesRoutes, { prefix: '/clientes' })
      await v1.register(fornecedoresRoutes, { prefix: '/fornecedores' })
      await v1.register(consultasRoutes, { prefix: '/consultas' })
      await v1.register(produtosRoutes)
      await v1.register(insumosRoutes, { prefix: '/insumos' })
      await v1.register(orcamentosRoutes)
      await v1.register(pedidosRoutes)
      await v1.register(artesRoutes)
      await v1.register(producaoRoutes)
      await v1.register(etiquetasRoutes)
      await v1.register(estoqueRoutes)
      await v1.register(financeiroRoutes)
      await v1.register(caixaRoutes)
      await v1.register(dashboardRoutes)
      await v1.register(relatoriosRoutes)
      await v1.register(vitrineRoutes)
      await v1.register(publicoRoutes, { prefix: '/publico/:empresa' })
      await v1.register(vitrinePublicaRoutes, { prefix: '/publico/:empresa/vitrine' })
      await v1.register(vitrinePermitidaRoutes, { prefix: '/publico' })
      await v1.register(webhooksRoutes, { prefix: '/plataforma' })
      await v1.register(cadastroRoutes, { prefix: '/plataforma' })
      await v1.register(plataformaRoutes, { prefix: '/plataforma' })
    },
    { prefix: API_PREFIX },
  )

  return app
}
