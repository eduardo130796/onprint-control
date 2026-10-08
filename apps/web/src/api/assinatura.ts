import type { AssinarInput, FormaAssinatura, MinhaAssinatura } from '@onprint/shared'
import { http } from './http'

/** Assinatura da própria empresa (funciona mesmo com o sistema bloqueado). */
export const assinaturaApi = {
  obter: () => http<MinhaAssinatura>('/assinatura'),
  assinar: (dados: AssinarInput) => http<{ linkPagamento: string | null }>('/assinatura/assinar', { method: 'POST', body: dados }),
  trocarPlano: (plano: string) => http<{ ok: true }>('/assinatura/plano', { method: 'POST', body: { plano } }),
  trocarForma: (forma: FormaAssinatura) => http<{ ok: true }>('/assinatura/forma', { method: 'POST', body: { forma } }),
  novoQrPix: () => http<{ ok: true }>('/assinatura/pix-automatico/novo-qr', { method: 'POST' }),
  cancelar: () => http<{ cancelarEm: string }>('/assinatura/cancelar', { method: 'POST' }),
}
