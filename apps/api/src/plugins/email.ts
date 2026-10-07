import fp from 'fastify-plugin'
import { criarProvedorEmail, type EmailMensagem } from '../integrations/email'

declare module 'fastify' {
  interface FastifyInstance {
    email: {
      /** E-mails chegam de verdade a alguém (SMTP, ou a pasta de cópias em desenvolvimento/testes) */
      configurado: boolean
      /** Envia e devolve se deu certo; falha de SMTP vai para o log e nunca derruba a operação. */
      enviar: (para: string, mensagem: Omit<EmailMensagem, 'para'>) => Promise<boolean>
    }
  }
}

export const emailPlugin = fp(async (app) => {
  const provedor = criarProvedorEmail(app.config, app.log)
  if (!app.config.SMTP_HOST) app.log.info('SMTP não configurado: os e-mails vão só para o log.')

  app.decorate('email', {
    configurado: Boolean(app.config.SMTP_HOST || app.config.EMAIL_PASTA),
    async enviar(para, mensagem) {
      try {
        await provedor.enviar({ ...mensagem, para })
        return true
      } catch (erro) {
        app.log.error({ err: erro, para, assunto: mensagem.assunto }, 'Falha ao enviar e-mail')
        return false
      }
    },
  })
})
