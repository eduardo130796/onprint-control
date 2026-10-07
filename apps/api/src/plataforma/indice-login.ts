import { Prisma, type PrismaClient } from '@prisma/client'
import { AppError } from '../core/AppError'

const EMAIL_EM_USO = 'Este e-mail já é usado por outro usuário. Cada e-mail entra em uma única empresa.'

/**
 * Índice e-mail → empresa (schema da plataforma), mantido junto com o cadastro de usuários.
 * O banco da plataforma é outro schema: não entra na transação da empresa, então quem chama
 * reserva antes e libera se a gravação da empresa falhar.
 */
export function criarIndiceLogin(plataforma: PrismaClient) {
  async function reservar(email: string, assinanteId: string, usuarioId: string) {
    try {
      await plataforma.indiceLogin.create({ data: { email, assinanteId, usuarioId } })
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        throw AppError.conflito(EMAIL_EM_USO, { campo: 'email' })
      }
      throw erro
    }
  }

  async function liberar(email: string, assinanteId: string) {
    await plataforma.indiceLogin.deleteMany({ where: { email, assinanteId } })
  }

  return {
    reservar,
    liberar,

    /** Reserva o e-mail, executa a gravação na empresa e desfaz a reserva se ela falhar. */
    async comReserva<T>(email: string, assinanteId: string, usuarioId: string, gravar: () => Promise<T>): Promise<T> {
      await reservar(email, assinanteId, usuarioId)
      try {
        return await gravar()
      } catch (erro) {
        await liberar(email, assinanteId)
        throw erro
      }
    },
  }
}

export type IndiceLogin = ReturnType<typeof criarIndiceLogin>
