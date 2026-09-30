import type { PrismaClient } from '@prisma/client'
import { hojeISO } from '@onprint/shared'

/**
 * 00:10 (seção 10): títulos em aberto com vencimento antes de hoje passam a "vencido".
 * Os parciais continuam "parcial" (o atraso aparece pela data). Devolve quantos mudaram.
 */
export async function marcarContasVencidas(prisma: PrismaClient): Promise<number> {
  const hoje = new Date(`${hojeISO()}T00:00:00Z`)
  const filtro = { status: 'aberto' as const, vencimento: { lt: hoje } }
  const [receber, pagar] = await Promise.all([
    prisma.contaReceber.updateMany({ where: filtro, data: { status: 'vencido' } }),
    prisma.contaPagar.updateMany({ where: filtro, data: { status: 'vencido' } }),
  ])
  return receber.count + pagar.count
}
