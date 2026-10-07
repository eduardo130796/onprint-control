import { createHmac, randomBytes } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

/** Validade do link: "esqueci a senha" é curto; convite dá tempo de a pessoa ver o e-mail. */
export const VALIDADE_HORAS = { redefinir: 1, convite: 72 } as const
export type FinalidadeToken = keyof typeof VALIDADE_HORAS

/** Só o hash vai para o banco: quem lê a tabela não consegue usar os links. */
export function hashTokenSenha(token: string, segredo: string): string {
  return createHmac('sha256', segredo).update(`senha:${token}`).digest('hex')
}

/** Links de senha (tabela da plataforma: o link chega sem login e diz a empresa e o usuário). */
export function criarTokensSenha(plataforma: PrismaClient, segredo: string) {
  return {
    /** Emite um link novo; os anteriores do mesmo usuário deixam de valer. */
    async emitir(d: { assinanteId: string; usuarioId: string; finalidade: FinalidadeToken; ip?: string }) {
      await plataforma.tokenSenha.updateMany({ where: { assinanteId: d.assinanteId, usuarioId: d.usuarioId, usadoEm: null }, data: { usadoEm: new Date() } })
      const token = randomBytes(32).toString('base64url')
      await plataforma.tokenSenha.create({
        data: {
          tokenHash: hashTokenSenha(token, segredo),
          assinanteId: d.assinanteId,
          usuarioId: d.usuarioId,
          finalidade: d.finalidade,
          ip: d.ip,
          expiraEm: new Date(Date.now() + VALIDADE_HORAS[d.finalidade] * 3_600_000),
        },
      })
      return token
    },

    /** Link ainda válido (não usado e não expirado), ou null. */
    validar(token: string) {
      return plataforma.tokenSenha.findFirst({ where: { tokenHash: hashTokenSenha(token, segredo), usadoEm: null, expiraEm: { gt: new Date() } } })
    },

    /** Marca como usado; false se outra requisição usou o mesmo link antes. */
    async consumir(id: string) {
      const r = await plataforma.tokenSenha.updateMany({ where: { id, usadoEm: null }, data: { usadoEm: new Date() } })
      return r.count === 1
    },
  }
}
