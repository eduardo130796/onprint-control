import fp from 'fastify-plugin'
import { criarAssistente, repositorioPrisma, type Assistente } from '../modules/assistente/assistente'

declare module 'fastify' {
  interface FastifyInstance {
    /** Assistente GrafyGo (IA): configuração da central, limite por empresa e registro de uso (uso_ia) */
    assistente: Assistente
  }
}

/** Assistente GrafyGo: desligado até a central (painel da plataforma) ligar e cadastrar a chave. */
export const assistentePlugin = fp(async (app) => {
  app.decorate('assistente', criarAssistente({ repositorio: repositorioPrisma(app.plataforma), env: app.config, log: app.log }))
})
