/* eslint-disable @typescript-eslint/no-explicit-any -- delegates do Prisma variam por modelo; a tipagem de entrada vem dos schemas Zod */
import type { Prisma, PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { AppError } from './AppError'
import { registrarAuditoria } from './auditoria'
import { filtroAtivo, paginacao, paginado } from './paginacao'
import { comConflitoAmigavel } from './prisma-erros'

type Db = PrismaClient | Prisma.TransactionClient

interface Delegate {
  count(args: any): Promise<number>
  findMany(args: any): Promise<any[]>
  findUnique(args: any): Promise<any>
  create(args: any): Promise<any>
  update(args: any): Promise<any>
}

export interface QueryCadastro {
  page: number
  pageSize: number
  sort?: string
  busca?: string
  ativo: 'true' | 'false' | 'todos'
}

export interface ConfigCrud<TDados extends object, TQuery extends QueryCadastro> {
  /** Nome da tabela (auditoria) */
  tabela: string
  /** "Acabamento", "Máquina"… (mensagens de erro) */
  rotulo: string
  delegate: (db: Db) => Delegate
  include?: object
  /** Campos de texto pesquisados por ?busca= */
  busca: string[]
  ordenaveis: readonly string[]
  padrao: { campo: string; direcao: 'asc' | 'desc' }
  filtros?: (q: TQuery) => object
  conflitos?: Record<string, string>
  /** Regras extras antes de gravar (lança AppError) */
  validar?: (dados: TDados, id: string | null) => Promise<void>
}

/**
 * Serviço CRUD padrão para cadastros simples: listagem paginada com busca,
 * criação/edição com auditoria e exclusão lógica (ativo = false).
 */
export function criarCrud<TDados extends object, TQuery extends QueryCadastro>(
  app: FastifyInstance,
  cfg: ConfigCrud<TDados, TQuery>,
) {
  const { prisma } = app
  // Resolvido a cada chamada: `prisma` aponta para o schema da empresa da requisição
  const db = () => cfg.delegate(prisma)
  const incluir = cfg.include ? { include: cfg.include } : {}

  async function obter(id: string) {
    const registro = await db().findUnique({ where: { id }, ...incluir })
    if (!registro) throw AppError.naoEncontrado(`${cfg.rotulo} não encontrado(a).`)
    return registro
  }

  return {
    obter,

    async listar(q: TQuery) {
      const texto = q.busca ? { contains: q.busca, mode: 'insensitive' } : undefined
      const where = {
        ...filtroAtivo(q.ativo),
        ...(cfg.filtros?.(q) ?? {}),
        ...(texto ? { OR: cfg.busca.map((campo) => ({ [campo]: texto })) } : {}),
      }
      const pag = paginacao(q, cfg.ordenaveis, cfg.padrao)
      const [total, data] = await Promise.all([db().count({ where }), db().findMany({ where, ...pag, ...incluir })])
      return paginado(data, total, q)
    },

    async criar(dados: TDados, usuarioId: string) {
      await cfg.validar?.(dados, null)
      return comConflitoAmigavel(
        () =>
          prisma.$transaction(async (tx) => {
            const registro = await cfg.delegate(tx).create({ data: { ...dados, createdBy: usuarioId }, ...incluir })
            await registrarAuditoria(tx, { tabela: cfg.tabela, registroId: registro.id, acao: 'criar', depois: registro, usuarioId })
            return registro
          }),
        cfg.conflitos ?? {},
      )
    },

    async atualizar(id: string, dados: TDados, usuarioId: string) {
      const antes = await obter(id)
      await cfg.validar?.(dados, id)
      return comConflitoAmigavel(
        () =>
          prisma.$transaction(async (tx) => {
            const registro = await cfg.delegate(tx).update({ where: { id }, data: dados, ...incluir })
            await registrarAuditoria(tx, { tabela: cfg.tabela, registroId: id, acao: 'editar', antes, depois: registro, usuarioId })
            return registro
          }),
        cfg.conflitos ?? {},
      )
    },

    /** Exclusão lógica / reativação. */
    async alterarAtivo(id: string, ativo: boolean, usuarioId: string) {
      const antes = await obter(id)
      return prisma.$transaction(async (tx) => {
        const registro = await cfg.delegate(tx).update({ where: { id }, data: { ativo }, ...incluir })
        await registrarAuditoria(tx, {
          tabela: cfg.tabela,
          registroId: id,
          acao: ativo ? 'editar' : 'desativar',
          antes,
          depois: registro,
          usuarioId,
        })
        return registro
      })
    },
  }
}

export type CrudService = ReturnType<typeof criarCrud<object, QueryCadastro>>
