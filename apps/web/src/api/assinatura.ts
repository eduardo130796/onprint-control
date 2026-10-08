import type { AssinarInput, FormaAssinatura, MinhaAssinatura, PreviaTrocaPlano } from '@onprint/shared'
import { http } from './http'

/** Assinatura da própria empresa (funciona mesmo com o sistema bloqueado). */
export const assinaturaApi = {
  obter: () => http<MinhaAssinatura>('/assinatura'),
  assinar: (dados: AssinarInput) => http<{ linkPagamento: string | null }>('/assinatura/assinar', { method: 'POST', body: dados }),
  /** Confere um cupom para o plano e devolve a mensalidade com desconto */
  conferirCupom: (codigo: string, plano: string) =>
    http<{ codigo: string; descricao: string; duracaoMeses: number | null; desconto: string; valor: string; cheio: string }>(`/assinatura/cupom?codigo=${encodeURIComponent(codigo)}&plano=${encodeURIComponent(plano)}`),
  previaTroca: (plano: string) => http<PreviaTrocaPlano>(`/assinatura/plano/previa?plano=${encodeURIComponent(plano)}`),
  trocarPlano: (plano: string) => http<PreviaTrocaPlano>('/assinatura/plano', { method: 'POST', body: { plano } }),
  trocarForma: (forma: FormaAssinatura) => http<{ ok: true }>('/assinatura/forma', { method: 'POST', body: { forma } }),
  novoQrPix: () => http<{ ok: true }>('/assinatura/pix-automatico/novo-qr', { method: 'POST' }),
  cancelar: () => http<{ cancelarEm: string }>('/assinatura/cancelar', { method: 'POST' }),
}
