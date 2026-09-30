/**
 * Ponto de extensão para mensagens ao cliente.
 * Hoje: CopiarMensagemProvider (copia o texto para colar manualmente no WhatsApp).
 * Futuro (Fase 9): provedor WhatsApp Cloud API / Evolution API implementando a mesma interface.
 */
export interface MensagemSaida {
  destinatario?: string
  texto: string
}

export interface ResultadoEnvio {
  /** "copiado" = o usuário precisa colar e enviar manualmente */
  status: 'copiado' | 'enviado'
}

export interface MessagingProvider {
  readonly nome: string
  enviar(mensagem: MensagemSaida): Promise<ResultadoEnvio>
}

export class CopiarMensagemProvider implements MessagingProvider {
  readonly nome = 'Copiar mensagem'

  async enviar({ texto }: MensagemSaida): Promise<ResultadoEnvio> {
    await navigator.clipboard.writeText(texto)
    return { status: 'copiado' }
  }
}

export const messagingProvider: MessagingProvider = new CopiarMensagemProvider()
