import { Prisma } from '@prisma/client'
import { AppError } from './AppError'

/**
 * Converte violação de unicidade (P2002) numa mensagem amigável por coluna.
 * Ex.: comConflitoAmigavel(() => prisma.cliente.create(...), { cpf_cnpj: 'CPF/CNPJ já cadastrado.' })
 */
export async function comConflitoAmigavel<T>(operacao: () => Promise<T>, mensagens: Record<string, string>): Promise<T> {
  try {
    return await operacao()
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      const alvo = ([] as string[]).concat((erro.meta?.target as string[] | string | undefined) ?? [])
      const campo = Object.keys(mensagens).find((c) => alvo.some((a) => a.includes(c)))
      if (campo) throw AppError.conflito(mensagens[campo] as string, { campo })
    }
    throw erro
  }
}
