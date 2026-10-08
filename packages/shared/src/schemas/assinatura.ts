import { z } from 'zod'
import { cpfCnpjValido } from '../documentos'
import { somenteDigitos } from '../format'

/** Da mais automática à mais manual (ordem em que aparecem na tela). */
export const FORMAS_ASSINATURA = ['pix_automatico', 'cartao', 'pix_boleto'] as const
export type FormaAssinatura = (typeof FORMAS_ASSINATURA)[number]
export const FORMA_ASSINATURA_ROTULOS: Record<FormaAssinatura, string> = {
  pix_automatico: 'PIX Automático',
  cartao: 'Cartão de crédito',
  pix_boleto: 'PIX ou boleto a cada mês',
}
export const FORMA_ASSINATURA_DETALHES: Record<FormaAssinatura, string> = {
  pix_automatico: 'Autorize uma vez no app do banco e as mensalidades são debitadas sozinhas.',
  cartao: 'Informe o cartão no 1º pagamento; as próximas são cobradas automaticamente.',
  pix_boleto: 'Todo mês chega a cobrança e você paga por PIX ou boleto.',
}
/** Formas em que a mensalidade é paga sozinha, sem ação do cliente */
export const FORMAS_AUTOMATICAS: readonly FormaAssinatura[] = ['pix_automatico', 'cartao']

const codigoPlano = z.string().trim().min(1, 'Escolha o plano.').max(40)

/** Assinar pelo pagamento online: plano, documento para a cobrança/nota e forma de pagamento. */
export const assinarSchema = z.object({
  plano: codigoPlano,
  cpfCnpj: z.preprocess(
    (v) => (typeof v === 'string' ? somenteDigitos(v) : v),
    z
      .string()
      .refine((v) => v.length === 11 || v.length === 14, 'Informe o CNPJ (ou CPF) para a cobrança e a nota fiscal.')
      .refine(cpfCnpjValido, 'CPF/CNPJ inválido.'),
  ),
  forma: z.enum(FORMAS_ASSINATURA),
})
export type AssinarInput = z.input<typeof assinarSchema>

export const trocarPlanoSchema = z.object({ plano: codigoPlano })
export const trocarFormaSchema = z.object({ forma: z.enum(FORMAS_ASSINATURA) })
