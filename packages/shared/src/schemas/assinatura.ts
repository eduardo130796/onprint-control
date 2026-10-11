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

// ─── Ciclo de cobrança (mensal ou anual com desconto) ───────────────────────

export const CICLOS_ASSINATURA = ['mensal', 'anual'] as const
export type CicloAssinatura = (typeof CICLOS_ASSINATURA)[number]
export const CICLO_ROTULOS: Record<CicloAssinatura, string> = { mensal: 'Mensal', anual: 'Anual' }

/** Meses que cada cobrança cobre */
export function mesesDoCiclo(ciclo: string | null | undefined): number {
  return ciclo === 'anual' ? 12 : 1
}

/** Preço cobrado a cada ciclo: no anual, o valor anual do plano (sem ele, 12 mensalidades) */
export function valorDoCiclo(plano: { valorMensal: string; valorAnual?: string | null }, ciclo: string | null | undefined): string {
  if (ciclo !== 'anual') return plano.valorMensal
  return plano.valorAnual ?? (Math.round(Number(plano.valorMensal) * 1200) / 100).toFixed(2)
}

/** Quanto o anual economiza frente a 12 mensalidades ("0.00" se não economiza) */
export function economiaAnual(valorMensal: string, valorAnual: string | null | undefined): string {
  if (!valorAnual) return '0.00'
  return (Math.max(0, Math.round(Number(valorMensal) * 1200) - Math.round(Number(valorAnual) * 100)) / 100).toFixed(2)
}

/** Quanto sai por mês pagando o ano (para "R$ 57,50/mês no anual") */
export function mensalNoAnual(valorAnual: string): string {
  return (Math.round((Number(valorAnual) * 100) / 12) / 100).toFixed(2)
}

/** "/mês" ou "/ano" depois do preço */
export function sufixoCiclo(ciclo: string | null | undefined): string {
  return ciclo === 'anual' ? '/ano' : '/mês'
}

const codigoPlano = z.string().trim().min(1, 'Escolha o plano.').max(40)

/** Assinar pelo pagamento online: plano, documento para a cobrança/nota e forma de pagamento. */
/** Código de cupom: digitado em qualquer caixa, guardado em maiúsculas. Vazio = sem cupom. */
export const codigoCupom = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toUpperCase() || undefined : v),
  z.string().regex(/^[A-Z0-9_-]{3,30}$/, 'Cupom inválido.').optional(),
)

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
  cupom: codigoCupom.optional(),
  /** Anual: um pagamento por ano com desconto (cartão ou PIX/boleto; cupons valem só no mensal) */
  ciclo: z.enum(CICLOS_ASSINATURA).default('mensal'),
})
export type AssinarInput = z.input<typeof assinarSchema>

export const trocarPlanoSchema = z.object({ plano: codigoPlano })
export const trocarFormaSchema = z.object({ forma: z.enum(FORMAS_ASSINATURA) })
