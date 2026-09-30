import type { Prisma } from '@prisma/client'

export type AcaoAuditoria = 'criar' | 'editar' | 'excluir' | 'desativar' | 'redefinir_senha' | 'permissoes' | 'override' | 'cancelar' | 'baixa' | 'estorno' | 'abrir' | 'fechar'

interface RegistroAuditoria {
  tabela: string
  registroId: string | null
  acao: AcaoAuditoria
  antes?: unknown
  depois?: unknown
  usuarioId: string | null
}

const CAMPOS_SENSIVEIS = new Set(['senhaHash', 'refreshTokenHash'])

/** Remove campos sensíveis e converte Decimal/Date para JSON puro. */
function limpar(valor: unknown): Prisma.InputJsonValue | undefined {
  if (valor === undefined || valor === null) return undefined
  return JSON.parse(
    JSON.stringify(valor, (chave, v) => (CAMPOS_SENSIVEIS.has(chave) ? undefined : v)),
  ) as Prisma.InputJsonValue
}

/** Registra uma alteração na tabela auditoria, dentro da mesma transação da operação. */
export async function registrarAuditoria(tx: Prisma.TransactionClient, registro: RegistroAuditoria) {
  await tx.auditoria.create({
    data: {
      tabela: registro.tabela,
      registroId: registro.registroId,
      acao: registro.acao,
      antes: limpar(registro.antes),
      depois: limpar(registro.depois),
      usuarioId: registro.usuarioId,
    },
  })
}
