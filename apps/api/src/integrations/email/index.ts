import type { FastifyBaseLogger } from 'fastify'

/**
 * Ponto de extensão para envio de e-mail (seção 13).
 * Hoje: LogEmailProvider apenas registra no log. Futuro: provedor SMTP com a mesma interface.
 */
export interface EmailMensagem {
  para: string
  assunto: string
  texto: string
}

export interface EmailProvider {
  enviar(mensagem: EmailMensagem): Promise<void>
}

export class LogEmailProvider implements EmailProvider {
  constructor(private readonly log: FastifyBaseLogger) {}

  async enviar(mensagem: EmailMensagem): Promise<void> {
    this.log.info({ email: mensagem }, 'E-mail não enviado (integração futura) — registrado no log')
  }
}
