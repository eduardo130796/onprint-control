import type { PrismaClient } from '@prisma/client'
import type { contatoSchema, enderecoSchema } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'

type Endereco = z.output<typeof enderecoSchema>
type Contato = z.output<typeof contatoSchema>

/** Endereços e contatos do cliente (sub-recursos de /clientes/:id). */
export function criarSubcadastrosCliente(prisma: PrismaClient, obterCliente: (id: string) => Promise<unknown>) {
  async function garantirEndereco(clienteId: string, id: string) {
    const item = await prisma.clienteEndereco.findFirst({ where: { id, clienteId } })
    if (!item) throw AppError.naoEncontrado('Endereço não encontrado.')
    return item
  }

  async function garantirContato(clienteId: string, id: string) {
    const item = await prisma.clienteContato.findFirst({ where: { id, clienteId } })
    if (!item) throw AppError.naoEncontrado('Contato não encontrado.')
    return item
  }

  return {
    async criarEndereco(clienteId: string, dados: Endereco, usuarioId: string) {
      await obterCliente(clienteId)
      return prisma.$transaction(async (tx) => {
        const item = await tx.clienteEndereco.create({
          data: { ...dados, uf: dados.uf as string, clienteId, createdBy: usuarioId },
        })
        await registrarAuditoria(tx, { tabela: 'cliente_enderecos', registroId: item.id, acao: 'criar', depois: item, usuarioId })
        return item
      })
    },

    async atualizarEndereco(clienteId: string, id: string, dados: Endereco, usuarioId: string) {
      const antes = await garantirEndereco(clienteId, id)
      return prisma.$transaction(async (tx) => {
        const item = await tx.clienteEndereco.update({ where: { id }, data: { ...dados, uf: dados.uf as string } })
        await registrarAuditoria(tx, { tabela: 'cliente_enderecos', registroId: id, acao: 'editar', antes, depois: item, usuarioId })
        return item
      })
    },

    async removerEndereco(clienteId: string, id: string, usuarioId: string) {
      const antes = await garantirEndereco(clienteId, id)
      await prisma.$transaction(async (tx) => {
        await tx.clienteEndereco.delete({ where: { id } })
        await registrarAuditoria(tx, { tabela: 'cliente_enderecos', registroId: id, acao: 'excluir', antes, usuarioId })
      })
    },

    async criarContato(clienteId: string, dados: Contato, usuarioId: string) {
      await obterCliente(clienteId)
      return prisma.$transaction(async (tx) => {
        // Só um contato principal por cliente
        if (dados.principal) await tx.clienteContato.updateMany({ where: { clienteId }, data: { principal: false } })
        const item = await tx.clienteContato.create({ data: { ...dados, clienteId, createdBy: usuarioId } })
        await registrarAuditoria(tx, { tabela: 'cliente_contatos', registroId: item.id, acao: 'criar', depois: item, usuarioId })
        return item
      })
    },

    async atualizarContato(clienteId: string, id: string, dados: Contato, usuarioId: string) {
      const antes = await garantirContato(clienteId, id)
      return prisma.$transaction(async (tx) => {
        if (dados.principal) {
          await tx.clienteContato.updateMany({ where: { clienteId, id: { not: id } }, data: { principal: false } })
        }
        const item = await tx.clienteContato.update({ where: { id }, data: dados })
        await registrarAuditoria(tx, { tabela: 'cliente_contatos', registroId: id, acao: 'editar', antes, depois: item, usuarioId })
        return item
      })
    },

    async removerContato(clienteId: string, id: string, usuarioId: string) {
      const antes = await garantirContato(clienteId, id)
      await prisma.$transaction(async (tx) => {
        await tx.clienteContato.delete({ where: { id } })
        await registrarAuditoria(tx, { tabela: 'cliente_contatos', registroId: id, acao: 'excluir', antes, usuarioId })
      })
    },
  }
}
