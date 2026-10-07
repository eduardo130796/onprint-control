import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { BASES_SEM_STATUS_PROPRIO, type novoStatusSchema, type statusConfigSchema, type templateSchema } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'

type Status = z.output<typeof statusConfigSchema>
type NovoStatus = z.output<typeof novoStatusSchema>
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

    /**
     * Status próprio (seção Configurações → Status): nasce logo depois da base no kanban.
     * O código é gerado (os do sistema são fixos e usados pelas regras de negócio).
     */
    async criarStatus(dados: NovoStatus, usuarioId: string) {
      const base = await prisma.statusConfig.findUnique({ where: { entidade_codigo: { entidade: dados.entidade, codigo: dados.base } } })
      if (!base?.sistema) throw AppError.regraNegocio('Escolha um status do sistema como base.')
      if (BASES_SEM_STATUS_PROPRIO[dados.entidade].includes(dados.base)) throw AppError.regraNegocio(`"${base.rotulo}" não aceita status próprio.`)
      const slug = dados.rotulo.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30)
      const codigo = `p_${slug || 'status'}_${randomBytes(2).toString('hex')}`
      return prisma.$transaction(async (tx) => {
        const status = await tx.statusConfig.create({
          data: { entidade: dados.entidade, codigo, rotulo: dados.rotulo, cor: dados.cor.toUpperCase(), ordem: dados.ordem ?? base.ordem, ehFinal: base.ehFinal, sistema: false, base: base.codigo, ativo: dados.ativo ?? true },
        })
        await registrarAuditoria(tx, { tabela: 'status_config', registroId: status.id, acao: 'criar', depois: status, usuarioId })
        return status
      })
    },

    /** Só status próprios podem ser excluídos; os registros nele voltam para a coluna da base. */
    async removerStatus(id: string, usuarioId: string) {
      const antes = await prisma.statusConfig.findUnique({ where: { id } })
      if (!antes) throw AppError.naoEncontrado('Status não encontrado.')
      if (antes.sistema) throw AppError.regraNegocio('Status do sistema não pode ser excluído; use "Ocultar".')
      await prisma.$transaction(async (tx) => {
        await tx.statusConfig.delete({ where: { id } })
        await registrarAuditoria(tx, { tabela: 'status_config', registroId: id, acao: 'excluir', antes, usuarioId })
      })
    },

    /** Rótulo, cor, ordem e oculto/visível. Os códigos são usados pelas regras de negócio. */
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
