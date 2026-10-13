/**
 * Copiar um texto para colar à mão (ex.: o template em Mensagens prontas).
 * O envio ao cliente pelo WhatsApp da gráfica (Evolution API) é o diálogo "Enviar pelo WhatsApp":
 * features/whatsapp/components/EnviarWhatsappDialog.tsx (com wa.me e "Copiar" quando não há conexão).
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
