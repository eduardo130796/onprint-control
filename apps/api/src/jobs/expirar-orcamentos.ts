import type { PrismaClient } from '@prisma/client'
import { hojeISO } from '@onprint/shared'

/** Marca como expirados os orçamentos abertos com validade anterior a hoje (São Paulo). */
export async function expirarOrcamentos(prisma: PrismaClient, hoje = hojeISO()): Promise<number> {
  const { count } = await prisma.orcamento.updateMany({
    where: { status: { in: ['rascunho', 'enviado', 'em_negociacao'] }, validade: { lt: new Date(`${hoje}T00:00:00Z`) } },
    data: { status: 'expirado' },
  })
  return count
}
