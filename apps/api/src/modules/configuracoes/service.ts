import type { FastifyInstance } from 'fastify'
import type { statusConfigSchema, templateSchema } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'

type Status = z.output<typeof statusConfigSchema>
type Template = z.output<typeof templateSchema>

/** Status do sistema (cor/rótulo) e templates de mensagens. */
export function criarConfiguracoesService(app: FastifyInstance) {
  const { prisma } = app

  async function obterTemplate(id: string) {
    const template = await prisma.mensagemTemplate.findUnique({ where: { id } })
    if (!template) throw AppError.naoEncontrado('Template não encontrado.')
    return template
  }

  return {
    listarStatus(entidade?: string) {
      return prisma.statusConfig.findMany({
        where: entidade ? { entidade } : {},
        orderBy: [{ entidade: 'asc' }, { ordem: 'asc' }],
      })
    },

    /** Só rótulo, cor e ordem são editáveis: os códigos são usados pelas regras de negócio. */
    async atualizarStatus(id: string, dados: Status, usuarioId: string) {
      const antes = await prisma.statusConfig.findUnique({ where: { id } })
      if (!antes) throw AppError.naoEncontrado('Status não encontrado.')
      return prisma.$transaction(async (tx) => {
        const status = await tx.statusConfig.update({ where: { id }, data: { ...dados, cor: dados.cor.toUpperCase() } })
        await registrarAuditoria(tx, { tabela: 'status_config', registroId: id, acao: 'editar', antes, depois: status, usuarioId })
        return status
      })
    },

    listarTemplates(filtro: { categoria?: string; somenteAtivos?: boolean }) {
      return prisma.mensagemTemplate.findMany({
        where: {
          ...(filtro.categoria ? { categoria: filtro.categoria } : {}),
          ...(filtro.somenteAtivos ? { ativo: true } : {}),
        },
        orderBy: [{ categoria: 'asc' }, { nome: 'asc' }],
      })
    },

    async criarTemplate(dados: Template, usuarioId: string) {
      return prisma.$transaction(async (tx) => {
        const template = await tx.mensagemTemplate.create({ data: { ...dados, createdBy: usuarioId } })
        await registrarAuditoria(tx, { tabela: 'mensagem_templates', registroId: template.id, acao: 'criar', depois: template, usuarioId })
        return template
      })
    },

    async atualizarTemplate(id: string, dados: Template, usuarioId: string) {
      const antes = await obterTemplate(id)
      return prisma.$transaction(async (tx) => {
        const template = await tx.mensagemTemplate.update({ where: { id }, data: dados })
        await registrarAuditoria(tx, { tabela: 'mensagem_templates', registroId: id, acao: 'editar', antes, depois: template, usuarioId })
        return template
      })
    },

    async removerTemplate(id: string, usuarioId: string) {
      const antes = await obterTemplate(id)
      await prisma.$transaction(async (tx) => {
        await tx.mensagemTemplate.delete({ where: { id } })
        await registrarAuditoria(tx, { tabela: 'mensagem_templates', registroId: id, acao: 'excluir', antes, usuarioId })
      })
    },
  }
}
