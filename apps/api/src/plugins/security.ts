import fp from 'fastify-plugin'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'

export const securityPlugin = fp(async (app) => {
  await app.register(helmet, {
    // O Swagger UI (só em desenvolvimento) usa scripts inline
    contentSecurityPolicy: app.config.NODE_ENV === 'production',
  })
  await app.register(cors, { origin: app.config.APP_URL, credentials: true })
  await app.register(cookie)
  // global: false → o limite é aplicado só nas rotas que declaram config.rateLimit (ex.: login)
  await app.register(rateLimit, { global: false })
})
