import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { somenteDigitos, type clienteSchema, type clientesQuerySchema } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { filtroAtivo, paginacao, paginado } from '../../core/paginacao'
import { comConflitoAmigavel } from '../../core/prisma-erros'
import { criarSubcadastrosCliente } from './subcadastros'

type Dados = z.output<typeof clienteSchema>
type Query = z.output<typeof clientesQuerySchema>

const CONFLITOS = {
  cpf_cnpj: 'Já existe um cliente com este CPF/CNPJ.',
  whatsapp: 'Já existe um cliente com este WhatsApp.',
}

const incluirVendedor = { vendedor: { select: { id: true, nome: true } } } as const

function filtroBusca(busca?: string): Prisma.ClienteWhereInput {
  if (!busca) return {}
  const digitos = somenteDigitos(busca)
  const texto = { contains: busca, mode: 'insensitive' as const }
  return {
    OR: [
      { nome: texto },
      { fantasia: texto },
      { email: texto },
      ...(digitos.length >= 3
        ? [{ cpfCnpj: { contains: digitos } }, { whatsapp: { contains: digitos } }, { telefone: { contains: digitos } }]
        : []),
    ],
  }
}

export function criarClientesService(app: FastifyInstance) {
  const { prisma } = app

  async function validarVendedor(vendedorId: string | null | undefined) {
    if (!vendedorId) return
    const vendedor = await prisma.usuario.findUnique({ where: { id: vendedorId }, select: { ativo: true } })
    if (!vendedor?.ativo) throw AppError.regraNegocio('Vendedor inválido ou desativado.')
  }

  async function obterBase(id: string) {
    const cliente = await prisma.cliente.findUnique({ where: { id } })
    if (!cliente) throw AppError.naoEncontrado('Cliente não encontrado.')
    return cliente
  }

  return {
    async listar(q: Query) {
      const where: Prisma.ClienteWhereInput = {
        ...filtroAtivo(q.ativo),
        ...(q.situacao ? { situacao: q.situacao } : {}),
        ...(q.vendedorId ? { vendedorId: q.vendedorId } : {}),
        ...filtroBusca(q.busca),
      }
      const pag = paginacao(q, ['nome', 'createdAt', 'situacao', 'updatedAt'] as const, { campo: 'nome', direcao: 'asc' })
      const [total, data] = await prisma.$transaction([
        prisma.cliente.count({ where }),
        prisma.cliente.findMany({ where, ...pag, include: incluirVendedor }),
      ])
      return paginado(data, total, q)
    },

    async obter(id: string) {
      const cliente = await prisma.cliente.findUnique({
        where: { id },
        include: {
          ...incluirVendedor,
          enderecos: { orderBy: [{ tipo: 'asc' }, { createdAt: 'asc' }] },
          contatos: { orderBy: [{ principal: 'desc' }, { nome: 'asc' }] },
        },
      })
      if (!cliente) throw AppError.naoEncontrado('Cliente não encontrado.')
      return cliente
    },

    async criar(dados: Dados, usuarioId: string) {
      await validarVendedor(dados.vendedorId)
      return comConflitoAmigavel(
        () =>
          prisma.$transaction(async (tx) => {
            const cliente = await tx.cliente.create({ data: { ...dados, createdBy: usuarioId }, include: incluirVendedor })
            await registrarAuditoria(tx, { tabela: 'clientes', registroId: cliente.id, acao: 'criar', depois: cliente, usuarioId })
            return cliente
          }),
        CONFLITOS,
      )
    },

    async atualizar(id: string, dados: Dados, usuarioId: string) {
      const antes = await obterBase(id)
      await validarVendedor(dados.vendedorId)
      return comConflitoAmigavel(
        () =>
          prisma.$transaction(async (tx) => {
            const cliente = await tx.cliente.update({ where: { id }, data: dados, include: incluirVendedor })
            await registrarAuditoria(tx, { tabela: 'clientes', registroId: id, acao: 'editar', antes, depois: cliente, usuarioId })
            return cliente
          }),
        CONFLITOS,
      )
    },

    /** Exclusão lógica. */
    async alterarAtivo(id: string, ativo: boolean, usuarioId: string) {
      const antes = await obterBase(id)
      return prisma.$transaction(async (tx) => {
        const cliente = await tx.cliente.update({ where: { id }, data: { ativo }, include: incluirVendedor })
        await registrarAuditoria(tx, {
          tabela: 'clientes',
          registroId: id,
          acao: ativo ? 'editar' : 'desativar',
          antes,
          depois: cliente,
          usuarioId,
        })
        return cliente
      })
    },

    ...criarSubcadastrosCliente(prisma, obterBase),
  }
}

export type ClientesService = ReturnType<typeof criarClientesService>
