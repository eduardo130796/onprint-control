import { z } from 'zod'
import { cpfCnpjValido } from '../documentos'
import { somenteDigitos } from '../format'

export const FORMAS_ASSINATURA = ['pix_boleto', 'cartao'] as const
export type FormaAssinatura = (typeof FORMAS_ASSINATURA)[number]
export const FORMA_ASSINATURA_ROTULOS: Record<FormaAssinatura, string> = {
  pix_boleto: 'PIX ou boleto (escolhe na hora de pagar)',
  cartao: 'Cartão de crédito (cobrança automática todo mês)',
}

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
