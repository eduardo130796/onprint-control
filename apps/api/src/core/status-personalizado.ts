import type { PrismaClient } from '@prisma/client'
import type { EntidadeComStatusProprio } from '@onprint/shared'
import { AppError } from './AppError'

/**
 * Valida a coluna própria pedida para um registro: tem de ser um status próprio da entidade
 * cuja base é o status atual do registro (a mudança de base, quando há, já foi feita pela ação normal).
 */
export async function validarStatusPersonalizado(prisma: PrismaClient, entidade: EntidadeComStatusProprio, id: string | null, statusAtual: string) {
  if (!id) return null
  const s = await prisma.statusConfig.findUnique({ where: { id } })
  if (!s || s.entidade !== entidade || s.sistema) throw AppError.regraNegocio('Status próprio não encontrado.')
  if (s.base !== statusAtual) {
    const base = await prisma.statusConfig.findUnique({ where: { entidade_codigo: { entidade, codigo: s.base ?? '' } } })
    throw AppError.regraNegocio(`"${s.rotulo}" só vale para registros em "${base?.rotulo ?? s.base}".`)
  }
  return s.id
}
