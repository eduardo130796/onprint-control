import { randomUUID } from 'node:crypto'
import argon2 from 'argon2'
import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { criarUsuarioSchema, editarUsuarioSchema, usuariosQuerySchema } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { filtroAtivo, paginacao, paginado } from '../../core/paginacao'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { comConflitoAmigavel } from '../../core/prisma-erros'
import { criarIndiceLogin } from '../../plataforma/indice-login'

type Criar = z.output<typeof criarUsuarioSchema>
type Editar = z.output<typeof editarUsuarioSchema>
type Query = z.output<typeof usuariosQuerySchema>

const CONFLITOS = { email: 'Já existe um usuário com este e-mail.' }

/** Nunca devolve senha_hash. */
const selecionar = {
  id: true,
  nome: true,
  email: true,
  telefone: true,
  comissaoPercentual: true,
  deveTrocarSenha: true,
  ultimoLogin: true,
  ativo: true,
  createdAt: true,
  updatedAt: true,
  papel: { select: { id: true, codigo: true, nome: true } },
} as const

export function criarUsuariosService(app: FastifyInstance) {
  const { prisma } = app
  const indice = criarIndiceLogin(app.plataforma)

  async function obter(id: string) {
    const usuario = await prisma.usuario.findUnique({ where: { id }, select: selecionar })
    if (!usuario) throw AppError.naoEncontrado('Usuário não encontrado.')
    return usuario
  }

  async function validarPapel(papelId: string) {
    const papel = await prisma.papel.findUnique({ where: { id: papelId } })
    if (!papel?.ativo) throw AppError.regraNegocio('Papel inválido.')
    return papel
  }

  /** Impede que o sistema fique sem nenhum administrador ativo. */
  async function garantirOutroAdmin(usuarioId: string) {
    const outros = await prisma.usuario.count({
      where: { id: { not: usuarioId }, ativo: true, papel: { codigo: 'admin' } },
    })
    if (outros === 0) throw AppError.regraNegocio('O sistema precisa de pelo menos um administrador ativo.')
  }

  async function revogarSessoes(tx: Prisma.TransactionClient, usuarioId: string) {
    await tx.sessao.updateMany({ where: { usuarioId, revogada: false }, data: { revogada: true } })
  }

  return {
    obter,

    async listar(q: Query) {
      const texto = q.busca ? { contains: q.busca, mode: 'insensitive' as const } : undefined
      const where: Prisma.UsuarioWhereInput = {
        ...filtroAtivo(q.ativo),
        ...(q.papelId ? { papelId: q.papelId } : {}),
        ...(texto ? { OR: [{ nome: texto }, { email: texto }] } : {}),
      }
      const pag = paginacao(q, ['nome', 'email', 'ultimoLogin', 'createdAt'] as const, { campo: 'nome', direcao: 'asc' })
      const [total, data] = await prisma.$transaction([
        prisma.usuario.count({ where }),
        prisma.usuario.findMany({ where, ...pag, select: selecionar }),
      ])
      return paginado(data, total, q)
    },

    /** Papéis ativos, para o campo "papel" do cadastro de usuários. */
    papeis() {
      return prisma.papel.findMany({
        where: { ativo: true },
        select: { id: true, codigo: true, nome: true },
        orderBy: { createdAt: 'asc' },
      })
    },

    /** Lista enxuta (id, nome) de usuários ativos — usada em campos como "vendedor". */
    opcoes() {
      return prisma.usuario.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } })
    },

    async criar(dados: Criar, autorId: string) {
      await validarPapel(dados.papelId)
      const { senhaProvisoria, ...resto } = dados
      const senhaHash = await argon2.hash(senhaProvisoria)
      const id = randomUUID()
      // O e-mail de login é único na plataforma inteira, não só nesta empresa
      return indice.comReserva(resto.email, contextoEmpresa.exigir().id, id, () =>
        comConflitoAmigavel(
          () =>
            prisma.$transaction(async (tx) => {
              const usuario = await tx.usuario.create({
                data: { ...resto, id, senhaHash, deveTrocarSenha: true, createdBy: autorId },
                select: selecionar,
              })
              await registrarAuditoria(tx, { tabela: 'usuarios', registroId: usuario.id, acao: 'criar', depois: usuario, usuarioId: autorId })
              return usuario
            }),
          CONFLITOS,
        ),
      )
    },

    async atualizar(id: string, dados: Editar, autorId: string) {
      const antes = await obter(id)
      const papel = await validarPapel(dados.papelId)
      const deixaDeSerAdmin = antes.papel.codigo === 'admin' && (papel.codigo !== 'admin' || !dados.ativo)
      if (deixaDeSerAdmin) await garantirOutroAdmin(id)
      if (id === autorId && !dados.ativo) throw AppError.regraNegocio('Você não pode desativar o próprio usuário.')

      const gravar = () =>
        comConflitoAmigavel(
          () =>
            prisma.$transaction(async (tx) => {
              const usuario = await tx.usuario.update({ where: { id }, data: dados, select: selecionar })
              if (!dados.ativo) await revogarSessoes(tx, id)
              await registrarAuditoria(tx, { tabela: 'usuarios', registroId: id, acao: 'editar', antes, depois: usuario, usuarioId: autorId })
              return usuario
            }),
          CONFLITOS,
        )
      if (dados.email === antes.email) return gravar()
      // Troca de e-mail: reserva o novo no índice de login e só então libera o antigo
      const empresaId = contextoEmpresa.exigir().id
      const usuario = await indice.comReserva(dados.email, empresaId, id, gravar)
      await indice.liberar(antes.email, empresaId)
      return usuario
    },

    /** O admin define uma senha provisória; o usuário é obrigado a trocá-la no próximo login. */
    async redefinirSenha(id: string, senhaProvisoria: string, autorId: string) {
      await obter(id)
      const senhaHash = await argon2.hash(senhaProvisoria)
      await prisma.$transaction(async (tx) => {
        await tx.usuario.update({ where: { id }, data: { senhaHash, deveTrocarSenha: true } })
        await revogarSessoes(tx, id)
        await registrarAuditoria(tx, { tabela: 'usuarios', registroId: id, acao: 'redefinir_senha', usuarioId: autorId })
      })
    },

    async desativar(id: string, autorId: string) {
      const antes = await obter(id)
      if (id === autorId) throw AppError.regraNegocio('Você não pode desativar o próprio usuário.')
      if (antes.papel.codigo === 'admin') await garantirOutroAdmin(id)
      return prisma.$transaction(async (tx) => {
        const usuario = await tx.usuario.update({ where: { id }, data: { ativo: false }, select: selecionar })
        await revogarSessoes(tx, id)
        await registrarAuditoria(tx, { tabela: 'usuarios', registroId: id, acao: 'desativar', antes, depois: usuario, usuarioId: autorId })
        return usuario
      })
    },
  }
}

export type UsuariosService = ReturnType<typeof criarUsuariosService>
