import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { somenteDigitos, type fornecedorSchema, type fornecedoresQuerySchema } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { filtroAtivo, paginacao, paginado } from '../../core/paginacao'
import { comConflitoAmigavel } from '../../core/prisma-erros'

type Dados = z.output<typeof fornecedorSchema>
type Query = z.output<typeof fornecedoresQuerySchema>

const CONFLITOS = { cpf_cnpj: 'Já existe um fornecedor com este CPF/CNPJ.' }

function filtroBusca(busca?: string): Prisma.FornecedorWhereInput {
  if (!busca) return {}
  const digitos = somenteDigitos(busca)
  const texto = { contains: busca, mode: 'insensitive' as const }
  return {
    OR: [
      { nome: texto },
      { fantasia: texto },
      { categoriaFornecimento: texto },
      { email: texto },
      ...(digitos.length >= 3 ? [{ cpfCnpj: { contains: digitos } }, { telefone: { contains: digitos } }] : []),
    ],
  }
}

export function criarFornecedoresService(app: FastifyInstance) {
  const { prisma } = app

  async function obter(id: string) {
    const fornecedor = await prisma.fornecedor.findUnique({ where: { id } })
    if (!fornecedor) throw AppError.naoEncontrado('Fornecedor não encontrado.')
    return fornecedor
  }

  return {
    obter,

    async listar(q: Query) {
      const where: Prisma.FornecedorWhereInput = { ...filtroAtivo(q.ativo), ...filtroBusca(q.busca) }
      const pag = paginacao(q, ['nome', 'createdAt', 'categoriaFornecimento'] as const, { campo: 'nome', direcao: 'asc' })
      const [total, data] = await prisma.$transaction([
        prisma.fornecedor.count({ where }),
        prisma.fornecedor.findMany({ where, ...pag }),
      ])
      return paginado(data, total, q)
    },

    async criar(dados: Dados, usuarioId: string) {
      return comConflitoAmigavel(
        () =>
          prisma.$transaction(async (tx) => {
            const item = await tx.fornecedor.create({ data: { ...dados, createdBy: usuarioId } })
            await registrarAuditoria(tx, { tabela: 'fornecedores', registroId: item.id, acao: 'criar', depois: item, usuarioId })
            return item
          }),
        CONFLITOS,
      )
    },

    async atualizar(id: string, dados: Dados, usuarioId: string) {
      const antes = await obter(id)
      return comConflitoAmigavel(
        () =>
          prisma.$transaction(async (tx) => {
            const item = await tx.fornecedor.update({ where: { id }, data: dados })
            await registrarAuditoria(tx, { tabela: 'fornecedores', registroId: id, acao: 'editar', antes, depois: item, usuarioId })
            return item
          }),
        CONFLITOS,
      )
    },

    /** Exclusão lógica. */
    async alterarAtivo(id: string, ativo: boolean, usuarioId: string) {
      const antes = await obter(id)
      return prisma.$transaction(async (tx) => {
        const item = await tx.fornecedor.update({ where: { id }, data: { ativo } })
        await registrarAuditoria(tx, {
          tabela: 'fornecedores',
          registroId: id,
          acao: ativo ? 'editar' : 'desativar',
          antes,
          depois: item,
          usuarioId,
        })
        return item
      })
    },
  }
}

export type FornecedoresService = ReturnType<typeof criarFornecedoresService>
