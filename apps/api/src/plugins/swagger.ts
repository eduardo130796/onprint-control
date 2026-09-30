import fp from 'fastify-plugin'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'

/** Documentação da API em /docs — somente fora de produção. */
export const swaggerPlugin = fp(async (app) => {
  if (app.config.NODE_ENV === 'production') return

  await app.register(swagger, {
    openapi: {
      info: { title: 'ONPrint Control API', version: '0.1.0' },
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
    },
    transform: jsonSchemaTransform,
  })
  await app.register(swaggerUi, { routePrefix: '/docs' })
})
