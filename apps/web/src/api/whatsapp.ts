import type { ConexaoWhatsapp, MensagemWhatsapp, Paginado, StatusMensagemWhatsapp, WhatsappConfig, WhatsappConfigInput } from '@onprint/shared'
import { http, qs } from './http'

export const CHAVE_WHATSAPP = ['whatsapp'] as const

/** WhatsApp da gráfica: conexão pelo QR code e avisos automáticos dos pedidos. */
export const whatsappApi = {
  config: () => http<WhatsappConfig>('/whatsapp'),
  salvar: (dados: WhatsappConfigInput) => http<WhatsappConfig>('/whatsapp', { method: 'PUT', body: dados }),
  /** Consulta a conexão agora (repetido enquanto o QR está na tela) */
  estado: () => http<WhatsappConfig>('/whatsapp/estado'),
  conectar: () => http<ConexaoWhatsapp>('/whatsapp/conectar', { method: 'POST' }),
  desconectar: () => http<WhatsappConfig>('/whatsapp/desconectar', { method: 'POST' }),
  mensagens: (q: { status?: StatusMensagemWhatsapp; page?: number; pageSize?: number }) => http<Paginado<MensagemWhatsapp>>(`/whatsapp/mensagens${qs(q)}`),
  reenviar: (id: string) => http<MensagemWhatsapp>(`/whatsapp/mensagens/${id}/reenviar`, { method: 'POST' }),
  ignorar: (id: string) => http<MensagemWhatsapp>(`/whatsapp/mensagens/${id}/ignorar`, { method: 'POST' }),
}
