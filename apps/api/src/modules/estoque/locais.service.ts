import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'
import type { localEstoqueSchema } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { comConflitoAmigavel } from '../../core/prisma-erros'

type Local = z.output<typeof localEstoqueSchema>

/** Locais de estoque. Sempre existe exatamente um local padrão ativo (baixa da produção). */
export function criarLocaisService(app: FastifyInstance) {
  const { prisma } = app

  async function validar(d: Local, id: string | null) {
    const atual = id ? await prisma.estoqueLocal.findUnique({ where: { id }, include: { saldos: { select: { quantidade: true } } } }) : null
    if (id && !atual) throw AppError.naoEncontrado('Local não encontrado.')
    if (atual?.padrao && (!d.padrao || !d.ativo)) throw AppError.regraNegocio('Escolha outro local como padrão antes de alterar este.')
    if (atual && !d.ativo && atual.saldos.some((s) => !s.quantidade.isZero())) {
      throw AppError.regraNegocio('Este local ainda tem saldo. Transfira ou ajuste o estoque antes de desativá-lo.')
    }
    if (d.padrao && !d.ativo) throw AppError.regraNegocio('O local padrão precisa estar ativo.')
  }

  async function salvar(d: Local, id: string | null, usuarioId: string) {
    await validar(d, id)
    return comConflitoAmigavel(
      () =>
        prisma.$transaction(async (tx) => {
          if (d.padrao) await tx.estoqueLocal.updateMany({ where: { padrao: true, ...(id ? { id: { not: id } } : {}) }, data: { padrao: false } })
          const dados = { nome: d.nome, descricao: d.descricao ?? null, padrao: d.padrao, ativo: d.ativo }
          const local = id ? await tx.estoqueLocal.update({ where: { id }, data: dados }) : await tx.estoqueLocal.create({ data: { ...dados, createdBy: usuarioId } })
          await registrarAuditoria(tx, { tabela: 'estoque_locais', registroId: local.id, acao: id ? 'editar' : 'criar', depois: dados, usuarioId })
          return local
        }),
      { nome: 'Já existe um local com este nome.' },
    )
  }

  return {
    listar: () => prisma.estoqueLocal.findMany({ orderBy: [{ ativo: 'desc' }, { nome: 'asc' }] }),
    criar: (d: Local, usuarioId: string) => salvar(d, null, usuarioId),
    atualizar: (id: string, d: Local, usuarioId: string) => salvar(d, id, usuarioId),
  }
}
