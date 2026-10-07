import fp from 'fastify-plugin'
import multipart from '@fastify/multipart'
import { resolve } from 'node:path'
import { StoragePorEmpresa, type StorageService } from '../core/storage'
import { API_PREFIX } from '../core/constantes'

declare module 'fastify' {
  interface FastifyInstance {
    storage: StorageService
  }
}

export const storagePlugin = fp(async (app) => {
  const { UPLOAD_DIR, UPLOAD_MAX_MB, JWT_ACCESS_SECRET } = app.config
  // Chave própria para URLs temporárias, derivada do segredo do access token
  const segredo = `${JWT_ACCESS_SECRET}:arquivos`
  app.decorate('storage', new StoragePorEmpresa(resolve(UPLOAD_DIR), segredo, API_PREFIX))
  await app.register(multipart, { limits: { fileSize: UPLOAD_MAX_MB * 1024 * 1024, files: 1, fields: 10 } })
})
